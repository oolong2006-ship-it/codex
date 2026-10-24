import {
  consentRecords,
  createOrgWithOwner,
  createStudyFromObjective,
  enqueueJob,
  interviewSessions,
  jobs,
  turns,
  updateStudySettings,
  upsertContact,
  whatsappContacts,
  type DbHandle,
} from "@majlis/db";
import { isolatedTestDb } from "@majlis/db/testing";
import { MockAsrProvider, MockEmbeddingProvider, MockWhatsAppProvider } from "@majlis/providers";
import { EncryptedObjectStore, FileObjectStore } from "@majlis/storage";
import { asc, eq } from "drizzle-orm";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerHandlers } from "../src/handlers.js";
import { JobRegistry } from "../src/jobs.js";
import { drain } from "../src/runner.js";
import { extractInviteToken, isDeleteRequest } from "../src/whatsapp.js";

const URL_TEST = process.env.DATABASE_URL_TEST;
const keys = {
  encryptionKey: Buffer.alloc(32, 5).toString("base64"),
  hashPepper: "pepper-for-tests-only",
};
const PHONE = "966551234567";

describe("WhatsApp helpers", () => {
  it("recognizes deletion requests and invite codes", () => {
    expect(isDeleteRequest("احذف")).toBe(true);
    expect(isDeleteRequest("أحذف")).toBe(true);
    expect(isDeleteRequest("لا تحذف شي")).toBe(false);
    expect(extractInviteToken("مجلس Ab3_xY9-Qw2zL0pK")).toBe("Ab3_xY9-Qw2zL0pK");
    expect(extractInviteToken("هلا")).toBeNull();
  });
});

describe.skipIf(!URL_TEST)("asynchronous WhatsApp interview", () => {
  let h: DbHandle;
  let inviteToken = "";
  let contactId = "";
  const whatsapp = new MockWhatsAppProvider();
  const asr = new MockAsrProvider();
  const deleted: string[] = [];
  const registry = new JobRegistry();

  beforeAll(async () => {
    h = await isolatedTestDb(URL_TEST!, "whatsapp");
    const org = await createOrgWithOwner(h.db, {
      orgName: "o",
      email: "wa@example.com",
      name: "n",
      password: "a long enough password",
    });
    const { study } = await createStudyFromObjective(h.db, {
      ...org,
      objective: "نقيس رضا زوار المطعم",
      topic: "مطعم الديرة",
    });
    await updateStudySettings(h.db, org.orgId, study.id, { status: "recruiting" });
    inviteToken = study.inviteToken;
    const inner = new FileObjectStore(mkdtempSync(join(tmpdir(), "majlis-wa-")));
    const recordings = new EncryptedObjectStore(inner, Buffer.alloc(32, 2).toString("base64"));
    const tracking = Object.assign(Object.create(recordings), {
      put: recordings.put.bind(recordings),
      get: recordings.get.bind(recordings),
      delete: async (key: string) => {
        deleted.push(key);
        await recordings.delete(key);
      },
    });
    registerHandlers(registry, {
      db: h.db,
      embedding: new MockEmbeddingProvider(),
      recordings: tracking,
      whatsapp: { provider: whatsapp, asr, keys, deletionUrl: "https://majlis.test/ar/delete" },
    });
    contactId = await upsertContact(h.db, PHONE, keys);
  });
  afterAll(async () => h?.close());

  let n = 0;
  const receive = async (message: { kind: "text" | "audio"; text?: string; mediaId?: string }) => {
    const before = whatsapp.sent.length;
    await enqueueJob(
      h.db,
      "whatsapp-inbound",
      { contactId, message: { messageId: `m${++n}`, ...message } },
      { dedupeKey: `wa:m${n}`, serialKey: `wa:${contactId}`, once: true },
    );
    await drain(h.db, registry);
    return whatsapp.sent.slice(before).map((s) => s.payload as string);
  };

  it("asks for the study code first", async () => {
    expect(await receive({ kind: "text", text: "السلام عليكم" })).toEqual([
      expect.stringContaining("رمز الدراسة"),
    ]);
  });

  it("starts with the cross-border notice, the deletion hint, then the disclosure", async () => {
    const replies = await receive({ kind: "text", text: `مجلس ${inviteToken}` });
    expect(replies).toHaveLength(3);
    expect(replies[0]).toContain("Meta");
    expect(replies[1]).toContain("احذف");
    expect(replies[1]).toMatch(/[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/);
    expect(replies[1]).toContain("https://majlis.test/ar/delete");
    expect(replies[2]).toContain("مساعدة ذكية");
    expect(replies[2]).toContain("مطعم الديرة");
    expect(whatsapp.sent.every((s) => s.participantRef === PHONE)).toBe(true);
  });

  it("records consent given by message, then interviews by voice and text", async () => {
    const afterConsent = await receive({ kind: "text", text: "إيه نبدأ" });
    expect(afterConsent[0]).toContain("نبدأ");
    const [session] = await h.db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.contactId, contactId));
    const consent = await h.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.sessionId, session!.id));
    expect(consent.map((c) => c.method)).toEqual(["message"]);
    expect(consent[0]!.disclosureText).toContain("مساعدة ذكية");

    asr.script({ text: "اخترته لأنه قريب من البيت والأكل دايم طازج", confidence: 0.91 });
    const afterVoice = await receive({ kind: "audio", mediaId: "media-1" });
    expect(afterVoice).toHaveLength(1);

    const stored = await h.db
      .select()
      .from(turns)
      .where(eq(turns.sessionId, session!.id))
      .orderBy(asc(turns.idx));
    const voiceAnswer = stored.find((t) => t.text.startsWith("اخترته"))!;
    expect(voiceAnswer.audioRef).toMatch(/\.ogg$/);
    expect(voiceAnswer.asrConfidence).toBeCloseTo(0.91);
  });

  it("finishes the interview across many messages and queues it for analysis", async () => {
    const answers = [
      "الطلب كان سريع والاستلام من السيارة سهل",
      "الأكل طعمه ممتاز والكمية مناسبة للعائلة",
      "الموظفين محترمين ويردون بسرعة على الطلبات",
      "الأسعار مقبولة مقارنة بالكمية والجودة",
      "أوسّع الجلسات العائلية وأخلي الإضاءة أهدى",
      "بقول لهم جربوه أكيد بس روحوا بدري",
    ];
    let last: string[] = [];
    for (const text of answers) {
      last = await receive({ kind: "text", text });
      const [s] = await h.db
        .select()
        .from(interviewSessions)
        .where(eq(interviewSessions.contactId, contactId));
      if (s!.status === "completed") break;
    }
    expect(last.at(-1)).toContain("يعطيك العافية");
    const [session] = await h.db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.contactId, contactId));
    expect(session).toMatchObject({ status: "completed", channel: "whatsapp" });
    const [contact] = await h.db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.id, contactId));
    expect(contact!.sessionId).toBeNull();
    const analyzed = await h.db.select().from(jobs).where(eq(jobs.kind, "analyze-session"));
    expect(analyzed.map((j) => j.status)).toEqual(["done"]);
  });

  it("does not process the same WhatsApp message twice", async () => {
    const payload = { contactId, message: { messageId: "dup-1", kind: "text", text: "هلا" } };
    await enqueueJob(h.db, "whatsapp-inbound", payload, {
      dedupeKey: "wa:dup-1",
      serialKey: `wa:${contactId}`,
      once: true,
    });
    await drain(h.db, registry);
    await enqueueJob(h.db, "whatsapp-inbound", payload, {
      dedupeKey: "wa:dup-1",
      serialKey: `wa:${contactId}`,
      once: true,
    });
    const dup = await h.db.select().from(jobs).where(eq(jobs.dedupeKey, "wa:dup-1"));
    expect(dup).toHaveLength(1);
  });

  it("erases everything for «احذف», including recordings and the number", async () => {
    const [session] = await h.db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.contactId, contactId));
    const replies = await receive({ kind: "text", text: "احذف" });
    expect(replies).toEqual([expect.stringContaining("تم حذف")]);
    expect(deleted.some((k) => k.startsWith(`recordings/${session!.id}/`))).toBe(true);
    expect(
      await h.db.select().from(interviewSessions).where(eq(interviewSessions.id, session!.id)),
    ).toEqual([]);
    expect(
      await h.db.select().from(whatsappContacts).where(eq(whatsappContacts.id, contactId)),
    ).toEqual([]);
  });
});
