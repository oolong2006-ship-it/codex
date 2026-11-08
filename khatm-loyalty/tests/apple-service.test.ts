import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, makeMerchant, makeCard } from "./helpers";
import { appleWebService } from "@/server/wallet/apple-service";
import { resetEnvCache } from "@/server/env";
import { addStamps } from "@/server/domain/stamping";

const TYPE = "pass.test.khatm";

beforeEach(async () => {
  process.env.APPLE_PASS_TYPE_ID = TYPE;
  resetEnvCache();
  await resetDb();
});

const call = (method: string, path: string, opts: { auth?: string; body?: string; since?: string } = {}) =>
  appleWebService(
    method,
    path.split("/").filter(Boolean),
    new Headers(opts.auth ? { authorization: `ApplePass ${opts.auth}` } : {}),
    opts.body ?? "",
    new URLSearchParams(opts.since ? { passesUpdatedSince: opts.since } : {}),
  );

describe("Apple Wallet web service", () => {
  it("registers devices with the card auth token and reports changed serials", async () => {
    const m = await makeMerchant();
    const card = await makeCard(m.slug);
    const reg = `devices/DEVICE1/registrations/${TYPE}/${card.serial}`;
    expect((await call("POST", reg, { auth: "wrong", body: '{"pushToken":"abcdef0123456789"}' })).status).toBe(401);
    expect((await call("POST", reg, { auth: card.authToken, body: '{"pushToken":"abcdef0123456789"}' })).status).toBe(201);
    expect((await call("POST", reg, { auth: card.authToken, body: '{"pushToken":"abcdef0123456789"}' })).status).toBe(200);
    expect((await call("POST", `devices/DEVICE1/registrations/pass.other/${card.serial}`, { auth: card.authToken, body: "{}" })).status).toBe(404);

    const list = await call("GET", `devices/DEVICE1/registrations/${TYPE}`);
    const body = (await list.json()) as { serialNumbers: string[]; lastUpdated: string };
    expect(body.serialNumbers).toEqual([card.serial]);
    expect((await call("GET", `devices/DEVICE1/registrations/${TYPE}`, { since: body.lastUpdated })).status).toBe(204);

    await new Promise((r) => setTimeout(r, 5));
    await addStamps(m.cashier, card.serial, 1);
    const changed = (await (await call("GET", `devices/DEVICE1/registrations/${TYPE}`, { since: body.lastUpdated })).json()) as { serialNumbers: string[] };
    expect(changed.serialNumbers).toEqual([card.serial]);

    expect((await call("GET", `passes/${TYPE}/${card.serial}`, { auth: "nope" })).status).toBe(401);
    expect((await call("DELETE", reg, { auth: card.authToken })).status).toBe(200);
    expect((await call("GET", `devices/DEVICE1/registrations/${TYPE}`)).status).toBe(204);
    expect((await call("POST", "log", { body: '{"logs":["hello"]}' })).status).toBe(200);
  });
});
