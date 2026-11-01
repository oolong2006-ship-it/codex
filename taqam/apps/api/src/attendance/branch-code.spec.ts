import { branchCode } from '@taqam/core';
import { checkBranchCode, nodeHmacSha256 } from './branch-code';

const hex = (s: string) => Buffer.from(s, 'ascii').toString('hex');

describe('branch code (node HMAC-SHA256)', () => {
  it('matches the RFC 6238 SHA-256 vector at T=59s (46119246 → 119246)', () => {
    expect(branchCode(hex('12345678901234567890123456789012'), new Date(59_000), nodeHmacSha256)).toBe('119246');
  });

  it('accepts the current and previous 30-second code, rejects older ones', () => {
    const secret = 'ab'.repeat(32);
    const now = new Date('2026-10-31T10:00:10Z');
    expect(checkBranchCode(secret, branchCode(secret, now, nodeHmacSha256), now)).toBe(true);
    expect(checkBranchCode(secret, branchCode(secret, new Date(now.getTime() - 30_000), nodeHmacSha256), now)).toBe(true);
    expect(checkBranchCode(secret, branchCode(secret, new Date(now.getTime() - 60_000), nodeHmacSha256), now)).toBe(false);
  });
});
