import { describe, it, expect } from 'vitest';
// @ts-expect-error -- node builtin; core ships no @types/node (tests run under node)
import { createHmac } from 'node:crypto';
import {
  branchCode,
  branchCodeExpiresIn,
  hotp,
  verifyBranchCode,
  type HmacFn,
} from './index';

const hex = (s: string) =>
  Array.from(s)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');

const bytes = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((b) => parseInt(b, 16)));

const nodeHmac =
  (algo: 'sha1' | 'sha256'): HmacFn =>
  (keyHex, msg) =>
    new Uint8Array(createHmac(algo, bytes(keyHex)).update(msg).digest());

const sha256 = nodeHmac('sha256');

describe('hotp (RFC 4226 dynamic truncation, injected HMAC)', () => {
  // RFC 4226 Appendix D uses HMAC-SHA1 with the ASCII secret "12345678901234567890".
  const rfcSecret = '3132333435363738393031323334353637383930';

  it('matches the RFC 4226 test vector (counter 1 → 287082)', () => {
    expect(rfcSecret).toBe(hex('12345678901234567890'));
    expect(hotp(rfcSecret, 1, nodeHmac('sha1'))).toBe('287082');
  });

  it('matches the rest of the RFC 4226 vectors', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, counter) => expect(hotp(rfcSecret, counter, nodeHmac('sha1'))).toBe(code));
  });

  it('matches RFC 6238 HMAC-SHA256 at T=59s (46119246 → last 6 digits)', () => {
    const secret = hex('12345678901234567890123456789012');
    expect(branchCode(secret, new Date(59_000), sha256)).toBe('119246');
  });
});

describe('branchCode / verifyBranchCode', () => {
  const secret = 'a1'.repeat(32);
  const at = new Date('2026-10-31T10:00:15Z');

  it('is 6 digits and stable within one 30-second step', () => {
    const code = branchCode(secret, at, sha256);
    expect(code).toMatch(/^\d{6}$/);
    expect(branchCode(secret, new Date('2026-10-31T10:00:29Z'), sha256)).toBe(code);
    expect(branchCode(secret, new Date('2026-10-31T10:00:00Z'), sha256)).toBe(code);
  });

  it('changes with the step and with the secret', () => {
    const code = branchCode(secret, at, sha256);
    expect(branchCode(secret, new Date(at.getTime() + 30_000), sha256)).not.toBe(code);
    expect(branchCode('b2'.repeat(32), at, sha256)).not.toBe(code);
  });

  it('accepts the current and the previous step, rejects two steps old', () => {
    const now = new Date(at.getTime());
    const current = branchCode(secret, now, sha256);
    const previous = branchCode(secret, new Date(now.getTime() - 30_000), sha256);
    const twoOld = branchCode(secret, new Date(now.getTime() - 60_000), sha256);
    expect(verifyBranchCode(secret, current, now, sha256)).toBe(true);
    expect(verifyBranchCode(secret, previous, now, sha256)).toBe(true);
    expect(verifyBranchCode(secret, twoOld, now, sha256)).toBe(false);
  });

  it('accepts the next step (clock skew) within the window', () => {
    const next = branchCode(secret, new Date(at.getTime() + 30_000), sha256);
    expect(verifyBranchCode(secret, next, at, sha256)).toBe(true);
    expect(verifyBranchCode(secret, next, at, sha256, 0)).toBe(false);
  });

  it('rejects malformed codes and trims surrounding spaces', () => {
    const current = branchCode(secret, at, sha256);
    expect(verifyBranchCode(secret, '', at, sha256)).toBe(false);
    expect(verifyBranchCode(secret, '12345', at, sha256)).toBe(false);
    expect(verifyBranchCode(secret, 'abcdef', at, sha256)).toBe(false);
    expect(verifyBranchCode(secret, ` ${current} `, at, sha256)).toBe(true);
  });

  it('accepts Arabic-Indic digits typed on a phone keypad', () => {
    const current = branchCode(secret, at, sha256);
    const arabic = current.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
    expect(verifyBranchCode(secret, arabic, at, sha256)).toBe(true);
  });

  it('reports seconds until the code changes', () => {
    expect(branchCodeExpiresIn(new Date('2026-10-31T10:00:15Z'))).toBe(15);
    expect(branchCodeExpiresIn(new Date('2026-10-31T10:00:00Z'))).toBe(30);
    expect(branchCodeExpiresIn(new Date('2026-10-31T10:00:29.5Z'))).toBe(1);
  });
});
