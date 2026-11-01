import { describe, expect, it } from 'vitest';
import { describeDevice } from './devices';

describe('describeDevice (HR sees the phone model family, never a photo)', () => {
  it('names common platforms from the user agent', () => {
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile Safari/604.1')).toBe('iPhone');
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36')).toBe('Android');
    expect(describeDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('iPad');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129')).toBe('Windows');
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('Mac');
  });
  it('falls back to a generic name', () => {
    expect(describeDevice(null)).toBe('');
    expect(describeDevice('curl/8.0')).toBe('');
  });
});

describe('receivedLate (board: «استُلم لاحقاً»)', () => {
  it('returns the received time only when it is more than 10 minutes after the captured time', async () => {
    const { receivedLate } = await import('./devices');
    expect(receivedLate('2026-10-31T05:00:00Z', '2026-10-31T07:30:00Z')).toBe('2026-10-31T07:30:00Z');
    expect(receivedLate('2026-10-31T05:00:00Z', '2026-10-31T05:10:00Z')).toBeNull();
    expect(receivedLate('2026-10-31T05:00:00Z', '2026-10-31T05:10:01Z')).toBe('2026-10-31T05:10:01Z');
    expect(receivedLate('2026-10-31T05:00:00Z', null)).toBeNull();
    expect(receivedLate(null, '2026-10-31T05:00:00Z')).toBeNull();
  });
});
