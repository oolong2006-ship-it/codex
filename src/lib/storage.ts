import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.env.STORAGE_LOCAL_DIR || "./storage/uploads";
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || "15");

export const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export class UploadError extends Error {}

export interface StoredFile {
  filePath: string; // relative key, e.g. "abc/uuid.pdf"
  fileName: string;
  fileSize: number;
  mimeType: string;
}

function validate(file: { size: number; type: string; name: string }) {
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new UploadError(`File exceeds ${MAX_MB}MB limit`);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new UploadError(`Unsupported file type: ${file.type || "unknown"}`);
  }
}

/**
 * Persist an uploaded File into tenant-scoped local storage.
 * Swap this driver for S3/Supabase in production — the interface stays the same.
 */
export async function storeFile(scope: string, file: File): Promise<StoredFile> {
  validate({ size: file.size, type: file.type, name: file.name });

  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = path.extname(file.name).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "");
  const key = `${safeScope}/${crypto.randomUUID()}${ext}`;
  const abs = path.join(ROOT, key);

  await mkdir(path.dirname(abs), { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(abs, buf);

  return {
    filePath: key,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  };
}

export async function readStoredFile(key: string): Promise<Buffer> {
  const abs = path.join(ROOT, key);
  if (!abs.startsWith(path.resolve(ROOT)) && !existsSync(abs)) {
    throw new UploadError("Invalid file path");
  }
  return readFile(abs);
}

export async function deleteStoredFile(key: string): Promise<void> {
  const abs = path.join(ROOT, key);
  if (existsSync(abs)) await unlink(abs);
}
