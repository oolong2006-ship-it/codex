import { describe, expect, it } from 'vitest';
import { canonicalJson } from './attendance';

describe('canonicalJson', () => {
  it('sorts keys at every depth and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it('is insensitive to key order', () => {
    expect(canonicalJson({ x: 1, y: 'ع' })).toBe(canonicalJson({ y: 'ع', x: 1 }));
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});
