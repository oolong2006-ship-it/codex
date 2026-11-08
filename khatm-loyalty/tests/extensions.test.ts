import { beforeEach, describe, expect, it } from "vitest";
import forge from "node-forge";
import { decodeJwt } from "jose";
import { inflateRawSync } from "node:zlib";
import { resetDb, makeMerchant, makeCard, one } from "./helpers";
import { enableIntegration, getIntegration, handlePosWebhook, signBody } from "@/server/integrations/pos";
import { foodicsAdapter } from "@/server/integrations/foodics";
import { exportCustomer, deleteCustomer, deleteSelf, customersCsv, listCustomers } from "@/server/domain/customers";
import { atRiskCustomers, kpis, weeklyVisits } from "@/server/domain/analytics";
import { sendCampaign, audienceSize } from "@/server/domain/campaigns";
import { addStamps } from "@/server/domain/stamping";
import { drainOutbox } from "@/server/outbox";
import { setMessagingProvider, ConsoleMessagingProvider } from "@/server/messaging/provider";
import { passViewBySerial } from "@/server/wallet/pass-view";
import { buildPkpass, buildPassJson } from "@/server/wallet/apple";
import { saveUrl } from "@/server/wallet/google";
import { AppError } from "@/server/errors";
import { pool } from "@/server/db";
import { enroll } from "@/server/domain/enrollment";

beforeEach(resetDb);

const errCode = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? e.code : Promise.reject(e)));

describe("POS webhook (Foodics adapter)", () => {
  it("verifies signature, stamps once per order id, and ignores open orders", async () => {
    const m = await makeMerchant();
    const card = await makeCard(m.slug, "0553334444");
    const id = await enableIntegration(m.owner, "foodics");
    const integ = (await getIntegration(m.owner, "foodics"))!;
    const order = (oid: string, status = 4) => JSON.stringify({ event: "order.updated", order: { id: oid, status, customer: { phone: "553334444", dial_code: 966 }, branch: { id: "x" } } });

    expect(await errCode(handlePosWebhook(id, order("o1"), "bad"))).toBe("errors.forbidden");
    const raw = order("o1");
    expect(await handlePosWebhook(id, raw, signBody(integ.webhook_secret, raw))).toBe("stamped");
    expect(await handlePosWebhook(id, raw, signBody(integ.webhook_secret, raw))).toBe("duplicate");
    const open = order("o2", 1);
    expect(await handlePosWebhook(id, open, signBody(integ.webhook_secret, open))).toBe("ignored");
    const second = order("o3");
    expect(await handlePosWebhook(id, second, signBody(integ.webhook_secret, second))).toBe("cooldown");
    const c = await one<{ total_stamps: number }>(`SELECT total_stamps FROM cards WHERE serial_number = $1`, [card.serial]);
    expect(c!.total_stamps).toBe(1);
  });

  it("parses Foodics phones with and without dial code", () => {
    expect(foodicsAdapter.parse({ order: { id: "1", status: 4, customer: { phone: "0551234567", dial_code: 966 } } })?.phone).toBe("+966551234567");
    expect(foodicsAdapter.parse({ order: { id: "1", status: 4, customer: null } })?.phone).toBeNull();
    expect(foodicsAdapter.parse({})).toBeNull();
  });
});

describe("privacy (PDPL)", () => {
  it("exports and deletes a customer while keeping anonymous history", async () => {
    const m = await makeMerchant();
    const card = await makeCard(m.slug);
    await addStamps(m.cashier, card.serial, 1);
    const { rows } = await listCustomers(m.owner);
    const exp = await exportCustomer(m.owner, rows[0]!.id);
    expect(exp.stampEvents).toHaveLength(1);
    const other = await makeMerchant("other");
    expect(await errCode(deleteCustomer(other.owner, rows[0]!.id))).toBe("errors.notFound");
    expect(await errCode(deleteCustomer(m.cashier, rows[0]!.id))).toBe("errors.forbidden");
    await deleteCustomer(m.owner, rows[0]!.id);
    expect((await listCustomers(m.owner)).total).toBe(0);
    const ev = await one<{ n: number }>(`SELECT count(*)::int AS n FROM stamp_events WHERE merchant_id = $1`, [m.owner.merchantId]);
    expect(ev!.n).toBe(1);
  });

  it("lets a customer delete their own data with the card token only", async () => {
    const m = await makeMerchant();
    const card = await makeCard(m.slug);
    expect(await errCode(deleteSelf(card.serial, "wrong-token"))).toBe("errors.notFound");
    await deleteSelf(card.serial, card.authToken);
    expect(await passViewBySerial(card.serial)).toBeNull();
  });

  it("exports CSV with BOM and formula protection", async () => {
    const m = await makeMerchant();
    await makeCard(m.slug, "0551234567", "=cmd|' /C calc'!A0");
    const csv = await customersCsv(m.owner);
    expect(csv.startsWith("﻿name,phone")).toBe(true);
    expect(csv).toContain("'=cmd");
  });
});

describe("analytics", () => {
  it("computes KPIs and flags overdue repeat customers", async () => {
    const m = await makeMerchant();
    const loyal = await makeCard(m.slug, "0550000001", "منتظم");
    const lapsed = await makeCard(m.slug, "0550000002", "منقطع");
    const card = async (serial: string) => (await one<{ id: string }>(`SELECT id FROM cards WHERE serial_number = $1`, [serial]))!.id;
    const insert = async (serial: string, daysAgo: number[]) => {
      for (const d of daysAgo) {
        await pool().query(
          `INSERT INTO stamp_events(merchant_id, card_id, branch_id, quantity, source, created_at) VALUES ($1,$2,$3,1,'STAFF', now() - make_interval(days => $4))`,
          [m.owner.merchantId, await card(serial), m.branchId, d],
        );
      }
    };
    await insert(loyal.serial, [1, 4, 7, 10]); // every 3 days, seen yesterday
    await insert(lapsed.serial, [40, 43, 46, 49]); // every 3 days, gone 40 days
    const risk = await atRiskCustomers(m.owner);
    expect(risk.map((r) => r.name)).toEqual(["منقطع"]);
    expect(risk[0]!.avgIntervalDays).toBe(3);
    const k = await kpis(m.owner);
    expect(k.customers).toBe(2);
    expect(k.visits30).toBe(4);
    expect(k.active30).toBe(1);
    expect(k.repeatRate).toBe(1);
    const weeks = await weeklyVisits(m.owner);
    expect(weeks).toHaveLength(12);
    expect(weeks.reduce((s, w) => s + w.visits, 0)).toBe(8);
  });
});

describe("campaigns", () => {
  it("only messages opted-in customers and personalises the text", async () => {
    const console_ = new ConsoleMessagingProvider();
    setMessagingProvider(console_);
    const m = await makeMerchant();
    await makeCard(m.slug, "0551000001", "نورة العتيبي"); // opted in (helper)
    await enroll({ programSlug: m.slug, name: "بدون موافقة", phone: "0551000002", consent: true, marketingOptIn: false }, "ip-z");
    expect(await audienceSize(m.owner, "ALL")).toBe(1);
    const n = await sendCampaign(m.owner, { templateKey: "eid", audience: "ALL", message: "عيدك مبارك {name} من {business}" });
    expect(n).toBe(1);
    await drainOutbox();
    expect(console_.sent).toHaveLength(1);
    expect(console_.sent[0]!.body.startsWith("عيدك مبارك نورة من")).toBe(true);
    const log = await one<{ status: string }>(`SELECT status FROM message_log`);
    expect(log!.status).toBe("SENT");
    expect(await errCode(sendCampaign(m.cashier, { templateKey: "eid", audience: "ALL", message: "xxxxxx" }))).toBe("errors.forbidden");
  });
});

/** Self-signed stand-ins for Apple's pass certificate + WWDR, to exercise the signing path. */
function selfSigned(cn: string) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  cert.setSubject([{ name: "commonName", value: cn }]);
  cert.setIssuer([{ name: "commonName", value: cn }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

function unzipStore(buf: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  let o = 0;
  while (buf.readUInt32LE(o) === 0x04034b50) {
    const method = buf.readUInt16LE(o + 8);
    const size = buf.readUInt32LE(o + 18);
    const nameLen = buf.readUInt16LE(o + 26);
    const extra = buf.readUInt16LE(o + 28);
    const name = buf.subarray(o + 30, o + 30 + nameLen).toString("utf8");
    const data = buf.subarray(o + 30 + nameLen + extra, o + 30 + nameLen + extra + size);
    out[name] = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    o += 30 + nameLen + extra + size;
  }
  return out;
}

describe("wallet passes", () => {
  it("builds a signed .pkpass with a valid manifest and PKCS#7 signature", async () => {
    const m = await makeMerchant();
    const card = await makeCard(m.slug);
    const view = (await passViewBySerial(card.serial))!;
    const signer = selfSigned("Pass Type ID: pass.test.khatm");
    const wwdr = selfSigned("Apple WWDR (test)");
    const cfg = { passTypeId: "pass.test.khatm", teamId: "TEAM123456", certPem: signer.certPem, keyPem: signer.keyPem, wwdrPem: wwdr.certPem, webServiceUrl: "https://x.test/api/wallet/apple", apnsHost: "localhost" };
    const files = unzipStore(buildPkpass(view, cfg));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["pass.json", "icon.png", "manifest.json", "signature", "ar.lproj/pass.strings"]));
    const manifest = JSON.parse(files["manifest.json"]!.toString());
    const sha1 = (b: Buffer) => forge.md.sha1.create().update(b.toString("binary")).digest().toHex();
    for (const [name, hash] of Object.entries(manifest)) expect(sha1(files[name]!)).toBe(hash);
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(files["signature"]!.toString("binary"))) as forge.pkcs7.PkcsSignedData;
    expect(p7.certificates).toHaveLength(2);
    const pass = JSON.parse(files["pass.json"]!.toString());
    expect(pass.serialNumber).toBe(card.serial);
    expect(pass.barcodes[0].message).toBe(view.barcode);
    expect(pass.authenticationToken).toBe(card.authToken);
    expect(buildPassJson(view, cfg).storeCard.primaryFields[0]!.value).toBe(`0 / ${view.stampsRequired}`);
  });

  it("builds a Google save link whose JWT embeds the loyalty object", async () => {
    const m = await makeMerchant();
    const card = await makeCard(m.slug);
    const view = (await passViewBySerial(card.serial))!;
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const pkcs8 = forge.pki.privateKeyInfoToPem(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keys.privateKey)));
    const url = await saveUrl({ issuerId: "3388000000000000000", clientEmail: "svc@test.iam.gserviceaccount.com", privateKeyPem: pkcs8, appUrl: "https://x.test" }, view);
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const claims = decodeJwt(url.split("/").pop()!) as { aud: string; typ: string; payload: { loyaltyObjects: Array<{ id: string; barcode: { value: string } }> } };
    expect(claims.aud).toBe("google");
    expect(claims.typ).toBe("savetowallet");
    expect(claims.payload.loyaltyObjects[0]!.id).toBe(`3388000000000000000.card_${card.serial}`);
    expect(claims.payload.loyaltyObjects[0]!.barcode.value).toBe(view.barcode);
  });
});
