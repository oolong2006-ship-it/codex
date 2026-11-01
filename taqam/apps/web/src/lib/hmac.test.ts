import { describe, expect, it } from 'vitest';
import { createHmac, createHash } from 'node:crypto';
import { branchCode } from '@taqam/core';
import { currentBranchCode, hmacSha256, sha256 } from './hmac';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const ascii = (s: string) => new TextEncoder().encode(s);
const asciiHex = (s: string) => hex(ascii(s));

describe('pure-JS SHA-256 / HMAC-SHA256', () => {
  it('hashes the FIPS 180-2 vectors', () => {
    expect(hex(sha256(ascii('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(ascii('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(sha256(ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('matches node crypto across block boundaries', () => {
    for (const len of [55, 56, 63, 64, 65, 119, 128, 1000]) {
      const msg = new Uint8Array(len).map((_, i) => (i * 31 + 7) & 0xff);
      expect(hex(sha256(msg))).toBe(createHash('sha256').update(msg).digest('hex'));
    }
  });

  it('matches RFC 4231 test case 2 ("Jefe")', () => {
    expect(hex(hmacSha256(asciiHex('Jefe'), ascii('what do ya want for nothing?')))).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });

  it('handles keys longer than one block (RFC 4231 test case 6) and matches node crypto', () => {
    const key = 'aa'.repeat(131);
    expect(hex(hmacSha256(key, ascii('Test Using Larger Than Block-Size Key - Hash Key First')))).toBe('60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
    const k2 = 'a1'.repeat(32);
    const msg = new Uint8Array([0, 0, 0, 0, 3, 0x5c, 0x1f, 0x22]);
    expect(hex(hmacSha256(k2, msg))).toBe(createHmac('sha256', Buffer.from(k2, 'hex')).update(msg).digest('hex'));
  });
});

describe('currentBranchCode (for the kiosk screen)', () => {
  it('agrees with core branchCode + the RFC 6238 SHA-256 vector', () => {
    const secret = asciiHex('12345678901234567890123456789012');
    expect(branchCode(secret, new Date(59_000), hmacSha256)).toBe('119246');
    expect(currentBranchCode(secret, new Date(59_000))).toEqual({ code: '119246', expiresInSeconds: 1 });
  });

  it('matches what the API computes with node crypto', () => {
    const secret = 'c0ffee'.repeat(10) + 'beef';
    const at = new Date('2026-10-31T10:00:15Z');
    const node = (k: string, m: Uint8Array) => new Uint8Array(createHmac('sha256', Buffer.from(k, 'hex')).update(m).digest());
    expect(currentBranchCode(secret, at)).toEqual({ code: branchCode(secret, at, node), expiresInSeconds: 15 });
  });
});
