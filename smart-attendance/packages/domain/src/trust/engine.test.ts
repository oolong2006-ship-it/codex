import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUST_POLICY, chooseSite, decideLocation, evaluatePunch, nextActionFor } from './engine';
import { circleSignedDistance, haversineMeters } from './geo';
import type { AssuranceLevel, CandidateSite, LocationSample, TrustInput } from './types';

// موقع مرجعي في الرياض: دائرة نصف قطرها 50م.
const CENTER = { lat: 24.7136, lng: 46.6753 };
const NOW = new Date('2026-10-26T06:00:00Z');
const ISSUED = new Date(NOW.getTime() - 10_000);

/** نقطة على بعد `m` متر شمال المركز. */
function north(m: number) {
  return { lat: CENTER.lat + m / 111_195, lng: CENTER.lng };
}

function site(over: Partial<CandidateSite> = {}): CandidateSite {
  return {
    site_id: 'site-1',
    geofence_version_id: 'gv-1',
    tolerance_m: 0,
    assurance_level: 'STANDARD',
    in_current_shift: true,
    wifi_uplift_enabled: false,
    known_bssid_hashes: [],
    signedDistance: circleSignedDistance(CENTER, 50),
    ...over,
  };
}

function sample(metersNorth: number, accuracy: number, over: Partial<LocationSample> = {}): LocationSample {
  return { ...north(metersNorth), accuracy_m: accuracy, captured_at: new Date(NOW.getTime() - 2_000), provider: 'fused', ...over };
}

function input(over: Partial<TrustInput> = {}): TrustInput {
  return {
    checks: { account_active: true, tenant_active: true, device_bound: true, attestation_ok: true, challenge_valid: true, sequence_valid: true },
    sites: [site()],
    samples: [sample(0, 10)],
    server_received_at: NOW,
    challenge_issued_at: ISSUED,
    risk: {},
    policy: DEFAULT_TRUST_POLICY,
    ...over,
  };
}

describe('geo helpers', () => {
  it('north() offsets are metric', () => {
    expect(haversineMeters(CENTER.lat, CENTER.lng, north(100).lat, north(100).lng)).toBeCloseTo(100, 0);
  });
});

describe('layer 1 — hard rejections (specs §A)', () => {
  const cases: [keyof TrustInput['checks'], string][] = [
    ['account_active', 'ACCOUNT_INACTIVE'],
    ['tenant_active', 'TENANT_INACTIVE'],
    ['device_bound', 'DEVICE_NOT_BOUND'],
    ['attestation_ok', 'ATTESTATION_FAILED'],
    ['challenge_valid', 'CHALLENGE_INVALID'],
    ['sequence_valid', 'SEQUENCE_INVALID'],
  ];
  for (const [key, code] of cases) {
    it(`${key}=false → REJECTED / ${code}`, () => {
      const r = evaluatePunch(input({ checks: { ...input().checks, [key]: false } }));
      expect(r.decision).toBe('REJECTED');
      expect(r.reasons).toEqual([code]);
    });
  }

  it('stops at the first failure in the specified order', () => {
    const r = evaluatePunch(input({ checks: { ...input().checks, account_active: false, device_bound: false } }));
    expect(r.reasons).toEqual(['ACCOUNT_INACTIVE']);
  });

  it('no authorized site → NO_AUTHORIZED_SITE (before SEQUENCE_INVALID)', () => {
    const r = evaluatePunch(input({ sites: [], checks: { ...input().checks, sequence_valid: false } }));
    expect(r.reasons).toEqual(['NO_AUTHORIZED_SITE']);
  });

  it('DEVICE_NOT_BOUND tells the employee to request a device change', () => {
    const r = evaluatePunch(input({ checks: { ...input().checks, device_bound: false } }));
    expect(r.next_action).toBe('REQUEST_DEVICE_CHANGE');
  });
});

describe('layer 2 — GeoTrust formula (specs §B)', () => {
  it('decideLocation covers every branch', () => {
    expect(decideLocation(-40, 10, 0, 100)).toEqual({ decision: 'VERIFIED', code: 'LOC_INSIDE' });
    expect(decideLocation(-10, 10, 0, 100)).toEqual({ decision: 'VERIFIED', code: 'LOC_INSIDE' }); // s + a = t
    expect(decideLocation(30, 10, 0, 100)).toEqual({ decision: 'REJECTED', code: 'LOC_OUTSIDE' });
    expect(decideLocation(10, 10, 0, 100)).toEqual({ decision: 'PENDING_REVIEW', code: 'LOC_UNCERTAIN' }); // s − a = t
    expect(decideLocation(-5, 10, 0, 100)).toEqual({ decision: 'PENDING_REVIEW', code: 'LOC_UNCERTAIN' });
    expect(decideLocation(-500, 101, 0, 100)).toEqual({ decision: 'PENDING_REVIEW', code: 'LOC_LOW_ACCURACY' });
    // التسامح t يوسّع الداخل والخارج
    expect(decideLocation(5, 10, 20, 100)).toEqual({ decision: 'VERIFIED', code: 'LOC_INSIDE' });
    expect(decideLocation(35, 10, 20, 100)).toEqual({ decision: 'REJECTED', code: 'LOC_OUTSIDE' });
  });

  it('inside the fence with good accuracy → VERIFIED / LOC_INSIDE', () => {
    const r = evaluatePunch(input());
    expect(r.decision).toBe('VERIFIED');
    expect(r.reasons).toEqual(['LOC_INSIDE']);
    expect(r.next_action).toBe('NONE');
    expect(r.s).toBeCloseTo(-50, 0);
    expect(r.a).toBe(10);
    expect(r.site_id).toBe('site-1');
    expect(r.geofence_version_id).toBe('gv-1');
  });

  it('far outside → REJECTED / LOC_OUTSIDE with an exception path', () => {
    const r = evaluatePunch(input({ samples: [sample(500, 10)] }));
    expect(r.decision).toBe('REJECTED');
    expect(r.reasons).toEqual(['LOC_OUTSIDE']);
    expect(r.next_action).toBe('SUBMIT_EXCEPTION');
  });

  it('near the edge → PENDING_REVIEW / LOC_UNCERTAIN', () => {
    const r = evaluatePunch(input({ samples: [sample(55, 20)] }));
    expect(r.decision).toBe('PENDING_REVIEW');
    expect(r.reasons).toEqual(['LOC_UNCERTAIN']);
  });

  it('F11: 300 m accuracy inside the fence → PENDING / LOC_LOW_ACCURACY + retry', () => {
    const r = evaluatePunch(input({ samples: [sample(0, 300)] }));
    expect(r.decision).toBe('PENDING_REVIEW');
    expect(r.reasons).toEqual(['LOC_LOW_ACCURACY']);
    expect(r.next_action).toBe('RETRY_LOCATION');
  });

  it('F10: a 5-minute-old sample → PENDING / LOC_NO_VALID_SAMPLE', () => {
    const r = evaluatePunch(input({ samples: [sample(0, 10, { captured_at: new Date(NOW.getTime() - 300_000) })] }));
    expect(r.decision).toBe('PENDING_REVIEW');
    expect(r.reasons).toEqual(['LOC_NO_VALID_SAMPLE']);
    expect(r.next_action).toBe('RETRY_LOCATION');
  });

  it('drops invalid coordinates and non-positive accuracy', () => {
    const r = evaluatePunch(
      input({ samples: [sample(0, 0), { ...sample(0, 5), lat: 200 }, { ...sample(0, 5), lat: 0, lng: 0 }] }),
    );
    expect(r.reasons).toEqual(['LOC_NO_VALID_SAMPLE']);
  });

  it('picks the sample with the smallest accuracy radius', () => {
    const r = evaluatePunch(input({ samples: [sample(0, 40), sample(10, 8), sample(5, 25)] }));
    expect(r.chosen_sample_index).toBe(1);
    expect(r.a).toBe(8);
  });

  it('F21: samples captured before the challenge was issued are ignored', () => {
    const r = evaluatePunch(input({ samples: [sample(0, 10, { captured_at: new Date(ISSUED.getTime() - 1_000) })] }));
    expect(r.reasons).toEqual(['LOC_NO_VALID_SAMPLE']);
  });

  it('F22: samples "from the future" are ignored and flag RISK_CLOCK_SKEW', () => {
    const r = evaluatePunch(input({ samples: [sample(0, 10, { captured_at: new Date(NOW.getTime() + 60_000) })] }));
    expect(r.decision).toBe('PENDING_REVIEW');
    expect(r.reasons).toEqual(['LOC_NO_VALID_SAMPLE', 'RISK_CLOCK_SKEW']);
  });

  it('F31: approximate location permission → PENDING / LOC_APPROXIMATE_PERMISSION + retry', () => {
    for (const auth of ['reduced', 'approximate'] as const) {
      const r = evaluatePunch(input({ risk: { accuracy_authorization: auth } }));
      expect(r.decision).toBe('PENDING_REVIEW');
      expect(r.reasons).toEqual(['LOC_APPROXIMATE_PERMISSION']);
      expect(r.next_action).toBe('RETRY_LOCATION');
    }
  });

  it('assurance level tightens the accuracy limit (ADR-0005)', () => {
    // سياج 200م: دقة 60م داخله تمامًا، فالفرق ناتج عن حد الدقة وحده.
    const big = circleSignedDistance(CENTER, 200);
    const samples = [sample(0, 60)];
    expect(evaluatePunch(input({ samples, sites: [site({ signedDistance: big })] })).decision).toBe('VERIFIED');
    const high = evaluatePunch(input({ samples, sites: [site({ assurance_level: 'HIGH', signedDistance: big })] }));
    expect(high.reasons).toEqual(['LOC_LOW_ACCURACY']);
    expect(high.assurance_level).toBe('HIGH');
  });

  it('assurance level tightens the sample age (ADR-0005)', () => {
    const samples = [sample(0, 10, { captured_at: new Date(NOW.getTime() - 18_000) })];
    const challenge_issued_at = new Date(NOW.getTime() - 60_000);
    const at = (level: AssuranceLevel) => evaluatePunch(input({ samples, challenge_issued_at, sites: [site({ assurance_level: level })] }));
    expect(at('HIGH').decision).toBe('VERIFIED');
    expect(at('STRICT').reasons).toEqual(['LOC_NO_VALID_SAMPLE']);
  });
});

describe('site choice (specs §B)', () => {
  const near = site({ site_id: 'near', in_current_shift: false, signedDistance: circleSignedDistance(north(0), 50) });
  const far = site({ site_id: 'far', in_current_shift: false, signedDistance: circleSignedDistance(north(300), 50) });

  it('prefers the site of the current shift even when another is nearer', () => {
    const shift = { ...far, site_id: 'shift', in_current_shift: true };
    expect(chooseSite([near, shift], sample(0, 10))?.site_id).toBe('shift');
  });

  it('otherwise picks the nearest authorized site', () => {
    expect(chooseSite([far, near], sample(0, 10))?.site_id).toBe('near');
  });
});

describe('layer 3 — risk signals only raise to PENDING (specs §A)', () => {
  it('F9: mock location inside the fence → PENDING / RISK_MOCK_LOCATION', () => {
    const r = evaluatePunch(input({ samples: [sample(0, 10, { is_mock: true })] }));
    expect(r.decision).toBe('PENDING_REVIEW');
    expect(r.reasons).toEqual(['LOC_INSIDE', 'RISK_MOCK_LOCATION']);
    expect(r.next_action).toBe('SUBMIT_EXCEPTION');
  });

  it('F19: iOS simulated location counts as mock', () => {
    const r = evaluatePunch(input({ samples: [sample(0, 10, { source_info: { simulated: true } })] }));
    expect(r.reasons).toContain('RISK_MOCK_LOCATION');
  });

  it('device integrity failure → PENDING / RISK_DEVICE_INTEGRITY', () => {
    const r = evaluatePunch(input({ risk: { meets_device_integrity: false } }));
    expect(r.decision).toBe('PENDING_REVIEW');
    expect(r.reasons).toContain('RISK_DEVICE_INTEGRITY');
  });

  it('F12: impossible travel between two branches → PENDING / RISK_IMPOSSIBLE_TRAVEL', () => {
    const r = evaluatePunch(
      input({ risk: { previous_event: { at: new Date(NOW.getTime() - 10 * 60_000), ...north(100_000), accuracy_m: 10 } } }),
    );
    expect(r.decision).toBe('PENDING_REVIEW');
    expect(r.reasons).toContain('RISK_IMPOSSIBLE_TRAVEL');
  });

  it('F30: adjacent branches with poor accuracy are not impossible travel', () => {
    const r = evaluatePunch(
      input({ risk: { previous_event: { at: new Date(NOW.getTime() - 5_000), ...north(80), accuracy_m: 60 } } }),
    );
    expect(r.signals).not.toContain('RISK_IMPOSSIBLE_TRAVEL');
  });

  it('a feasible trip is not flagged', () => {
    const r = evaluatePunch(
      input({ risk: { previous_event: { at: new Date(NOW.getTime() - 60 * 60_000), ...north(20_000), accuracy_m: 10 } } }),
    );
    expect(r.decision).toBe('VERIFIED');
  });

  it('F13: phone clock one hour ahead → server time rules, + RISK_CLOCK_SKEW', () => {
    const r = evaluatePunch(input({ risk: { client_time: new Date(NOW.getTime() + 3_600_000) } }));
    expect(r.decision).toBe('PENDING_REVIEW');
    expect(r.reasons).toContain('RISK_CLOCK_SKEW');
  });

  it('F14: two accounts on one phone → RISK_SHARED_DEVICE', () => {
    expect(evaluatePunch(input({ risk: { other_accounts_on_device_24h: 1 } })).reasons).toContain('RISK_SHARED_DEVICE');
  });

  it('recent rebind within the policy window → RISK_RECENT_REBIND', () => {
    expect(evaluatePunch(input({ risk: { rebound_within_days: 2 } })).reasons).toContain('RISK_RECENT_REBIND');
    expect(evaluatePunch(input({ risk: { rebound_within_days: 8 } })).decision).toBe('VERIFIED');
  });

  it('a risk signal never turns an inside punch into REJECTED without explicit opt-in', () => {
    const r = evaluatePunch(input({ samples: [sample(0, 10, { is_mock: true })] }));
    expect(r.decision).not.toBe('REJECTED');
  });

  it('client opt-in (reject_on) escalates to REJECTED', () => {
    const policy = { ...DEFAULT_TRUST_POLICY, reject_on: ['RISK_MOCK_LOCATION' as const] };
    const r = evaluatePunch(input({ policy, samples: [sample(0, 10, { is_mock: true })] }));
    expect(r.decision).toBe('REJECTED');
    expect(r.reasons).toContain('RISK_MOCK_LOCATION');
  });
});

describe('aggregated evidence score (ADR-0003)', () => {
  it('F29: inconsistent samples in one window', () => {
    const r = evaluatePunch(input({ samples: [sample(0, 10), sample(2_000, 10)] }));
    expect(r.signals).toContain('RISK_SAMPLE_INCONSISTENT');
  });

  it('F28: remote-control app alone reaches the STANDARD threshold', () => {
    const r = evaluatePunch(input({ risk: { app_access_risk: ['UNKNOWN_CONTROLLING'] } }));
    expect(r.decision).toBe('PENDING_REVIEW');
    expect(r.reasons).toContain('RISK_REMOTE_CONTROL_APP');
    expect(r.risk_points).toBe(3);
  });

  it('a low-weight signal alone stays VERIFIED in STANDARD but not in STRICT', () => {
    const samples = [sample(0, 10, { source_info: { accessory: true } })];
    expect(evaluatePunch(input({ samples })).decision).toBe('VERIFIED');
    const strict = evaluatePunch(input({ samples, sites: [site({ assurance_level: 'STRICT' })] }));
    expect(strict.decision).toBe('PENDING_REVIEW');
    expect(strict.reasons).toContain('RISK_LOCATION_ACCESSORY');
  });

  it('investigation-only signals never change the decision', () => {
    for (const level of ['STANDARD', 'HIGH', 'STRICT'] as AssuranceLevel[]) {
      const r = evaluatePunch(input({ risk: { app_attest_key_churn: true }, sites: [site({ assurance_level: level })] }));
      expect(r.decision).toBe('VERIFIED');
      expect(r.signals).toContain('RISK_APP_ATTEST_KEY_CHURN');
    }
  });

  it('F27: unverified boot is a weighted risk', () => {
    const r = evaluatePunch(input({ risk: { verified_boot: false } }));
    expect(r.decision).toBe('PENDING_REVIEW');
    expect(r.reasons).toContain('RISK_BOOT_UNVERIFIED');
  });

  it('implausibly precise accuracy for the site is flagged', () => {
    const r = evaluatePunch(input({ samples: [sample(0, 1)], risk: { site_accuracy_p50_m: 40 } }));
    expect(r.signals).toContain('RISK_ACCURACY_IMPLAUSIBLE');
  });

  it('records GNSS support without changing the decision', () => {
    const r = evaluatePunch(input({ samples: [sample(0, 10, { provider: 'gps' })] }));
    expect(r.signals).toContain('SUP_PROVIDER_GNSS');
    expect(r.support_points).toBe(1);
  });
});

describe('Wi-Fi uplift (ADR-0003)', () => {
  const wifiSite = (level: AssuranceLevel = 'STANDARD') =>
    site({ wifi_uplift_enabled: true, known_bssid_hashes: ['h-1'], assurance_level: level });
  const edge = [sample(55, 20)];

  it('F32: LOC_UNCERTAIN + known branch Wi-Fi + no risk → VERIFIED with both codes', () => {
    const r = evaluatePunch(input({ sites: [wifiSite()], samples: edge, risk: { wifi_connected_bssid_hash: 'h-1' } }));
    expect(r.decision).toBe('VERIFIED');
    expect(r.reasons).toEqual(['LOC_UNCERTAIN', 'SUP_WIFI_KNOWN']);
  });

  it('F33: never lifts LOC_OUTSIDE', () => {
    const r = evaluatePunch(input({ sites: [wifiSite()], samples: [sample(500, 10)], risk: { wifi_connected_bssid_hash: 'h-1' } }));
    expect(r.decision).toBe('REJECTED');
  });

  it('F34: never lifts in STRICT', () => {
    const r = evaluatePunch(input({ sites: [wifiSite('STRICT')], samples: [sample(55, 20)], risk: { wifi_connected_bssid_hash: 'h-1' } }));
    expect(r.decision).toBe('PENDING_REVIEW');
  });

  it('does not lift when the site has not enabled it, or when any risk is present', () => {
    const disabled = evaluatePunch(
      input({ sites: [site({ known_bssid_hashes: ['h-1'] })], samples: edge, risk: { wifi_connected_bssid_hash: 'h-1' } }),
    );
    expect(disabled.decision).toBe('PENDING_REVIEW');
    const risky = evaluatePunch(
      input({ sites: [wifiSite()], samples: [sample(55, 20, { source_info: { accessory: true } })], risk: { wifi_connected_bssid_hash: 'h-1' } }),
    );
    expect(risky.decision).toBe('PENDING_REVIEW');
  });

  it('an unknown network at a site with known networks is a weighted risk', () => {
    const r = evaluatePunch(input({ sites: [wifiSite()], risk: { wifi_connected_bssid_hash: 'other' } }));
    expect(r.signals).toContain('RISK_WIFI_UNKNOWN_AT_SITE');
  });
});

describe('next action', () => {
  it('maps decisions to the employee action', () => {
    expect(nextActionFor('VERIFIED', ['LOC_INSIDE'])).toBe('NONE');
    expect(nextActionFor('PENDING_REVIEW', ['LOC_UNCERTAIN'])).toBe('SUBMIT_EXCEPTION');
    expect(nextActionFor('REJECTED', ['DEVICE_NOT_BOUND'])).toBe('REQUEST_DEVICE_CHANGE');
  });
});
