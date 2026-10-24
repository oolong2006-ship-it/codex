import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  EncryptedObjectStore,
  FileObjectStore,
  S3ObjectStore,
  createObjectStore,
  pcmToWav,
} from "../src/index.js";

const KEY = Buffer.alloc(32, 7).toString("base64");
const dir = () => mkdtempSync(join(tmpdir(), "majlis-store-"));

describe("EncryptedObjectStore", () => {
  it("round-trips data and never writes it in clear", async () => {
    const root = dir();
    const store = new EncryptedObjectStore(new FileObjectStore(root), KEY);
    const audio = new TextEncoder().encode("صوت المشارك ".repeat(20));
    await store.put("recordings/s1/t1.wav", audio, "audio/wav");
    expect(await store.get("recordings/s1/t1.wav")).toEqual(audio);
    const raw = readFileSync(join(root, "recordings/s1/t1.wav"));
    expect(raw.includes(Buffer.from("صوت"))).toBe(false);
  });

  it("detects tampering and swapped files", async () => {
    const root = dir();
    const inner = new FileObjectStore(root);
    const store = new EncryptedObjectStore(inner, KEY);
    await store.put("a.wav", new Uint8Array([1, 2, 3]), "audio/wav");
    await inner.put("b.wav", (await inner.get("a.wav"))!, "audio/wav");
    await expect(store.get("b.wav")).rejects.toThrow();
  });

  it("deletes and reports missing objects", async () => {
    const store = new EncryptedObjectStore(new FileObjectStore(dir()), KEY);
    await store.put("x/y.wav", new Uint8Array([9]), "audio/wav");
    await store.delete("x/y.wav");
    expect(await store.get("x/y.wav")).toBeNull();
  });

  it("refuses keys that could escape the store", async () => {
    const store = new FileObjectStore(dir());
    await expect(store.put("../etc/passwd", new Uint8Array(), "x")).rejects.toThrow(/invalid/);
    await expect(store.put("/abs", new Uint8Array(), "x")).rejects.toThrow(/invalid/);
  });

  it("will not start without an encryption key", () => {
    expect(() => createObjectStore({})).toThrow(/STORAGE_ENCRYPTION_KEY/);
    expect(() => createObjectStore({ STORAGE_ENCRYPTION_KEY: "c2hvcnQ=" })).toThrow(/32 bytes/);
  });
});

describe("S3ObjectStore", () => {
  it("signs requests and uses path-style URLs", async () => {
    const seen: { method: string; url: string; auth: string }[] = [];
    const objects = new Map<string, Buffer>();
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization ?? "" });
        if (req.method === "PUT") objects.set(req.url!, Buffer.concat(chunks));
        if (req.method === "GET") {
          const obj = objects.get(req.url!);
          res.statusCode = obj ? 200 : 404;
          return res.end(obj);
        }
        if (req.method === "DELETE") objects.delete(req.url!);
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const s3 = new S3ObjectStore({
      endpoint,
      bucket: "rec",
      accessKeyId: "AK",
      secretAccessKey: "SK",
      region: "me-central-2",
    });
    await s3.put("recordings/s1/t1.wav", new Uint8Array([1, 2]), "audio/wav");
    expect(await s3.get("recordings/s1/t1.wav")).toEqual(new Uint8Array([1, 2]));
    await s3.delete("recordings/s1/t1.wav");
    expect(await s3.get("recordings/s1/t1.wav")).toBeNull();
    expect(seen[0]).toMatchObject({ method: "PUT", url: "/rec/recordings/s1/t1.wav" });
    expect(seen[0]!.auth).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/me-central-2\/s3\/aws4_request/,
    );
    server.close();
  });
});

it("wraps PCM in a playable WAV header", () => {
  const wav = pcmToWav(new Uint8Array(320));
  expect(Buffer.from(wav.subarray(0, 4)).toString()).toBe("RIFF");
  expect(wav.byteLength).toBe(364);
  expect(readdirSync(tmpdir()).length).toBeGreaterThan(0);
});
