import { describe, it, expect } from 'vitest';
import { documentCompliance, requiredDocTypes, SECTOR_DOC_TYPES, SECTOR_REQUIRED_DOCS, DocumentComplianceInput } from './index';

const TODAY = '2026-10-31';
const iqama = (employeeId: string, expiryDate: string | null = '2027-06-01') => ({ employeeId, type: 'IQAMA', expiryDate });

describe('requiredDocTypes (spec §4)', () => {
  it('maps each sector to its regulator documents; non-Saudis always need an iqama', () => {
    expect(requiredDocTypes('RESTAURANTS', false)).toEqual(['IQAMA', 'HEALTH_CERTIFICATE']);
    expect(requiredDocTypes('RESTAURANTS', true)).toEqual(['HEALTH_CERTIFICATE']);
    expect(requiredDocTypes('HEALTHCARE', true)).toEqual(['PROFESSIONAL_LICENSE']);
    expect(requiredDocTypes('LOGISTICS', true)).toEqual(['DRIVER_CARD', 'DRIVING_LICENSE']);
    expect(requiredDocTypes('RETAIL', false)).toEqual(['IQAMA']);
    expect(requiredDocTypes('CONTRACTING', true)).toEqual([]);
    expect(requiredDocTypes(null, false)).toEqual(['IQAMA']);
    expect(requiredDocTypes(null, true)).toEqual([]);
    expect(requiredDocTypes('OTHER', true)).toEqual([]);
  });

  it('exposes the four new document types and the sector table as data', () => {
    expect(SECTOR_DOC_TYPES).toEqual(['HEALTH_CERTIFICATE', 'PROFESSIONAL_LICENSE', 'DRIVER_CARD', 'DRIVING_LICENSE']);
    expect(SECTOR_REQUIRED_DOCS).toEqual({
      RESTAURANTS: ['HEALTH_CERTIFICATE'],
      HEALTHCARE: ['PROFESSIONAL_LICENSE'],
      LOGISTICS: ['DRIVER_CARD', 'DRIVING_LICENSE'],
    });
  });
});

describe('documentCompliance (spec §4)', () => {
  const base = (over: Partial<DocumentComplianceInput>): DocumentComplianceInput => ({ sector: null, today: TODAY, employees: [], documents: [], ...over });

  it('RESTAURANTS: non-Saudi with an iqama but no health certificate → MISSING health certificate', () => {
    const r = documentCompliance(base({
      sector: 'RESTAURANTS',
      employees: [{ id: 'e1', isSaudi: false, exemptions: [] }],
      documents: [iqama('e1')],
    }));
    expect(r).toEqual([{ employeeId: 'e1', type: 'HEALTH_CERTIFICATE', status: 'MISSING' }]);
  });

  it('HEALTHCARE: professional license expiring in 20 days → CRITICAL', () => {
    const r = documentCompliance(base({
      sector: 'HEALTHCARE',
      employees: [{ id: 'n1', isSaudi: true, exemptions: [] }],
      documents: [{ employeeId: 'n1', type: 'PROFESSIONAL_LICENSE', expiryDate: '2026-11-20' }],
    }));
    expect(r).toEqual([{ employeeId: 'n1', type: 'PROFESSIONAL_LICENSE', status: 'CRITICAL' }]);
  });

  it('LOGISTICS requires both the TGA driver card and the driving licence', () => {
    const none = documentCompliance(base({ sector: 'LOGISTICS', employees: [{ id: 'd1', isSaudi: true, exemptions: [] }] }));
    expect(none).toEqual([
      { employeeId: 'd1', type: 'DRIVER_CARD', status: 'MISSING' },
      { employeeId: 'd1', type: 'DRIVING_LICENSE', status: 'MISSING' },
    ]);
    const one = documentCompliance(base({
      sector: 'LOGISTICS',
      employees: [{ id: 'd1', isSaudi: true, exemptions: [] }],
      documents: [{ employeeId: 'd1', type: 'DRIVING_LICENSE', expiryDate: '2030-01-01' }],
    }));
    expect(one).toEqual([{ employeeId: 'd1', type: 'DRIVER_CARD', status: 'MISSING' }]);
  });

  it('an exemption removes the requirement (e.g. an accountant in a clinic)', () => {
    const r = documentCompliance(base({
      sector: 'HEALTHCARE',
      employees: [{ id: 'acc', isSaudi: true, exemptions: ['PROFESSIONAL_LICENSE'] }],
    }));
    expect(r).toEqual([]);
  });

  it('a Saudi never requires an iqama', () => {
    expect(documentCompliance(base({ sector: 'RETAIL', employees: [{ id: 's1', isSaudi: true, exemptions: [] }] }))).toEqual([]);
    expect(documentCompliance(base({ sector: 'RETAIL', employees: [{ id: 'x1', isSaudi: false, exemptions: [] }] })))
      .toEqual([{ employeeId: 'x1', type: 'IQAMA', status: 'MISSING' }]);
  });

  it('two health certificates: the newest expiry wins (expired old + valid new → no item)', () => {
    const r = documentCompliance(base({
      sector: 'RESTAURANTS',
      employees: [{ id: 'c1', isSaudi: true, exemptions: [] }],
      documents: [
        { employeeId: 'c1', type: 'HEALTH_CERTIFICATE', expiryDate: '2026-01-01' },
        { employeeId: 'c1', type: 'HEALTH_CERTIFICATE', expiryDate: '2027-09-01' },
      ],
    }));
    expect(r).toEqual([]);
  });

  it('null sector → only the iqama rule applies', () => {
    const r = documentCompliance(base({
      sector: null,
      employees: [
        { id: 'a', isSaudi: false, exemptions: [] },
        { id: 'b', isSaudi: true, exemptions: [] },
        { id: 'c', isSaudi: false, exemptions: [] },
      ],
      documents: [iqama('c', '2026-10-30')],
    }));
    expect(r).toEqual([
      { employeeId: 'a', type: 'IQAMA', status: 'MISSING' },
      { employeeId: 'c', type: 'IQAMA', status: 'EXPIRED' },
    ]);
  });

  it('maps EXPIRED / CRITICAL (≤30d) / WARNING (≤90d) and omits OK and non-expiring documents', () => {
    const emps = ['e', 'c', 'w', 'ok', 'none'].map((id) => ({ id, isSaudi: true, exemptions: [] }));
    const r = documentCompliance(base({
      sector: 'RESTAURANTS',
      employees: emps,
      documents: [
        { employeeId: 'e', type: 'HEALTH_CERTIFICATE', expiryDate: '2026-10-30' },
        { employeeId: 'c', type: 'HEALTH_CERTIFICATE', expiryDate: '2026-11-30' }, // 30 days
        { employeeId: 'w', type: 'HEALTH_CERTIFICATE', expiryDate: '2027-01-29' }, // 90 days
        { employeeId: 'ok', type: 'HEALTH_CERTIFICATE', expiryDate: '2027-01-30' }, // 91 days
        { employeeId: 'none', type: 'HEALTH_CERTIFICATE', expiryDate: null },
      ],
    }));
    expect(r).toEqual([
      { employeeId: 'e', type: 'HEALTH_CERTIFICATE', status: 'EXPIRED' },
      { employeeId: 'c', type: 'HEALTH_CERTIFICATE', status: 'CRITICAL' },
      { employeeId: 'w', type: 'HEALTH_CERTIFICATE', status: 'WARNING' },
    ]);
  });

  it('a non-expiring copy satisfies the requirement even beside an expired one; documents of other employees/types are ignored', () => {
    const r = documentCompliance(base({
      sector: 'RESTAURANTS',
      employees: [{ id: 'k', isSaudi: true, exemptions: [] }],
      documents: [
        { employeeId: 'k', type: 'HEALTH_CERTIFICATE', expiryDate: '2025-01-01' },
        { employeeId: 'k', type: 'HEALTH_CERTIFICATE', expiryDate: null },
        { employeeId: 'other', type: 'HEALTH_CERTIFICATE', expiryDate: '2025-01-01' },
        { employeeId: 'k', type: 'CERTIFICATE', expiryDate: '2025-01-01' },
      ],
    }));
    expect(r).toEqual([]);
  });

  it('Employee.idExpiry counts as one more iqama copy for non-Saudis (latest wins)', () => {
    const run = (idExpiry: string | null | undefined, documents: DocumentComplianceInput['documents'] = []) =>
      documentCompliance(base({ sector: 'RETAIL', employees: [{ id: 'x', isSaudi: false, exemptions: [], idExpiry }], documents }));
    expect(run('2027-06-01')).toEqual([]); // idExpiry only → no item
    expect(run('2027-06-01', [iqama('x', '2026-01-01')])).toEqual([]); // old expired doc + newer idExpiry
    expect(run('2026-11-10')).toEqual([{ employeeId: 'x', type: 'IQAMA', status: 'CRITICAL' }]); // 10 days, no doc
    expect(run('2026-01-01', [iqama('x', '2027-06-01')])).toEqual([]); // newer document wins over a stale idExpiry
    expect(run(null)).toEqual([{ employeeId: 'x', type: 'IQAMA', status: 'MISSING' }]);
    expect(run(undefined)).toEqual([{ employeeId: 'x', type: 'IQAMA', status: 'MISSING' }]);
    // a Saudi's idExpiry is the national ID — never an iqama requirement
    expect(documentCompliance(base({ sector: 'RETAIL', employees: [{ id: 's', isSaudi: true, exemptions: [], idExpiry: '2020-01-01' }] }))).toEqual([]);
  });

  it('sector keys are case-insensitive', () => {
    expect(requiredDocTypes('restaurants', true)).toEqual(['HEALTH_CERTIFICATE']);
  });
});
