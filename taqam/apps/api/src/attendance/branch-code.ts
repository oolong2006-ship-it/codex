import { createHmac } from 'crypto';
import { branchCode, branchCodeExpiresIn, verifyBranchCode, type HmacFn } from '@taqam/core';

/** HMAC-SHA256 from node `crypto`, injected into the runtime-agnostic core branch code. */
export const nodeHmacSha256: HmacFn = (keyHex, msg) =>
  new Uint8Array(createHmac('sha256', Buffer.from(keyHex, 'hex')).update(msg).digest());

/** True when `code` is the branch's current code (±1 30-second step). */
export function checkBranchCode(secretHex: string, code: string, at: Date = new Date()): boolean {
  return verifyBranchCode(secretHex, code, at, nodeHmacSha256);
}

/** The code a branch kiosk shows right now and how long it stays valid. */
export function currentBranchCode(secretHex: string, at: Date = new Date()) {
  return { code: branchCode(secretHex, at, nodeHmacSha256), expiresInSeconds: branchCodeExpiresIn(at) };
}
