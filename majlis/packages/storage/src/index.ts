import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { AwsClient } from "aws4fetch";

/** Minimal object store used for recordings. Keys are opaque, never contain personal data. */
export interface ObjectStore {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

function assertKey(key: string): void {
  if (!/^[\w./-]{1,300}$/.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error(`invalid object key: ${key}`);
  }
}

/** Files under a root directory (development and tests). */
export class FileObjectStore implements ObjectStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    assertKey(key);
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error(`invalid object key: ${key}`);
    return full;
  }

  async put(key: string, data: Uint8Array, _contentType?: string): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/** Any S3-compatible service hosted inside the Kingdom (path-style URLs). */
export class S3ObjectStore implements ObjectStore {
  private readonly client: AwsClient;
  constructor(private readonly cfg: S3Config) {
    this.client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      service: "s3",
    });
  }

  private url(key: string): string {
    assertKey(key);
    return `${this.cfg.endpoint.replace(/\/+$/, "")}/${this.cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const res = await this.client.fetch(this.url(key), {
      method: "PUT",
      body: data,
      headers: { "Content-Type": contentType },
    });
    if (!res.ok) throw new Error(`storage put failed: HTTP ${res.status}`);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const res = await this.client.fetch(this.url(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`storage get failed: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const res = await this.client.fetch(this.url(key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`storage delete failed: HTTP ${res.status}`);
  }
}

const MAGIC = new TextEncoder().encode("MJL1");

/**
 * AES-256-GCM encryption in the application, so recordings are encrypted at
 * rest whatever the storage provider does. Layout: MAGIC | iv(12) | tag(16) | data.
 */
export class EncryptedObjectStore implements ObjectStore {
  private readonly key: Buffer;
  constructor(
    private readonly inner: ObjectStore,
    keyBase64: string,
  ) {
    this.key = Buffer.from(keyBase64, "base64");
    if (this.key.length !== 32)
      throw new Error("STORAGE_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(key));
    const body = Buffer.concat([cipher.update(data), cipher.final()]);
    await this.inner.put(key, Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]), contentType);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const blob = await this.inner.get(key);
    if (!blob) return null;
    const buf = Buffer.from(blob);
    if (!buf.subarray(0, 4).equals(Buffer.from(MAGIC))) throw new Error("object is not encrypted");
    const decipher = createDecipheriv("aes-256-gcm", this.key, buf.subarray(4, 16));
    // Binding the key as AAD stops one participant's file being swapped for another's.
    decipher.setAAD(Buffer.from(key));
    decipher.setAuthTag(buf.subarray(16, 32));
    return new Uint8Array(Buffer.concat([decipher.update(buf.subarray(32)), decipher.final()]));
  }

  delete(key: string): Promise<void> {
    return this.inner.delete(key);
  }
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Builds the configured store. Encryption is mandatory: without a key the
 * store refuses to start rather than writing recordings in clear.
 */
export function createObjectStore(env: Env = process.env): ObjectStore {
  const encryptionKey = env.STORAGE_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("STORAGE_ENCRYPTION_KEY is required to store recordings");
  const inner: ObjectStore = env.STORAGE_ENDPOINT
    ? new S3ObjectStore({
        endpoint: env.STORAGE_ENDPOINT,
        bucket: env.STORAGE_BUCKET ?? "majlis-recordings",
        accessKeyId: env.STORAGE_ACCESS_KEY ?? "",
        secretAccessKey: env.STORAGE_SECRET_KEY ?? "",
        region: env.DATA_REGION || "us-east-1",
      })
    : new FileObjectStore(env.STORAGE_DIR ?? "./.recordings");
  return new EncryptedObjectStore(inner, encryptionKey);
}

/** Wraps 16 kHz mono PCM s16le in a WAV container for playback. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 16_000): Uint8Array {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  return new Uint8Array(Buffer.concat([header, pcm]));
}
