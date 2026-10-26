import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, hmacHex, randomToken, safeEqual } from './crypto';
import { redact } from '../common/audit.service';

describe('crypto helpers', () => {
  const key = randomBytes(32);

  it('round-trips encrypted secrets and rejects tampering', () => {
    const enc = encryptSecret(key, 'JBSWY3DPEHPK3PXP');
    expect(enc).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(key, enc)).toBe('JBSWY3DPEHPK3PXP');
    const [iv, tag, ct] = enc.split('.');
    const flipped = Buffer.from(ct as string, 'base64url');
    flipped[0] = (flipped[0] as number) ^ 1;
    expect(() => decryptSecret(key, [iv, tag, flipped.toString('base64url')].join('.'))).toThrow();
  });

  it('produces distinct high-entropy tokens', () => {
    const a = randomToken();
    expect(a).toHaveLength(43);
    expect(a).not.toBe(randomToken());
  });

  it('HMAC depends on the key', () => {
    expect(hmacHex(key, 'ABCD2345')).not.toBe(hmacHex(randomBytes(32), 'ABCD2345'));
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
  });
});

describe('audit redaction', () => {
  it('hashes sensitive fields at any depth', () => {
    const out = redact({ status: 'ACTIVE', code: 'ABCD2345', nested: { refresh_token: 'x', ok: 1 } }) as Record<
      string,
      unknown
    >;
    expect(out.status).toBe('ACTIVE');
    expect(String(out.code)).toMatch(/^sha256:/);
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
    expect(String((out.nested as Record<string, unknown>).refresh_token)).toMatch(/^sha256:/);
  });
});
