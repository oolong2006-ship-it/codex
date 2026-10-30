import { describe, expect, it } from 'vitest';
import { pathOf, withFlash } from '../lib/flash';

describe('flash messages', () => {
  it('adds a message to a bare path', () => {
    expect(withFlash('/exceptions', 'ok', 'تم')).toBe('/exceptions?ok=%D8%AA%D9%85');
  });

  it('keeps the existing filters and replaces an old message of the same kind', () => {
    const next = withFlash('/exceptions?status=OPEN&error=old', 'error', 'new');
    expect(next).toBe('/exceptions?status=OPEN&error=new');
  });

  it('extracts the path', () => {
    expect(pathOf('/devices?status=OPEN')).toBe('/devices');
  });
});
