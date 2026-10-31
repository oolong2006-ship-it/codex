import { describe, expect, it } from 'vitest';
import { EXEMPTION_HINT, REFILE_HINT, employeeRequirements, sectorDocTypes, toggleExemption } from './sector-docs';

const TODAY = '2026-10-31';

describe('employee sector-document requirements (employee documents tab)', () => {
  it('restaurant non-Saudi: iqama + health certificate, with each status', () => {
    const r = employeeRequirements('RESTAURANTS', { isSaudi: false, docExemptions: [] }, [
      { type: 'IQAMA', expiryDate: '2027-06-01' },
    ], TODAY);
    expect(r).toEqual([
      { type: 'IQAMA', exempt: false, status: 'OK' },
      { type: 'HEALTH_CERTIFICATE', exempt: false, status: 'MISSING' },
    ]);
  });

  it('an exempted type is listed as exempt with no status; the newest copy wins', () => {
    const r = employeeRequirements('LOGISTICS', { isSaudi: true, docExemptions: ['DRIVER_CARD'] }, [
      { type: 'DRIVING_LICENSE', expiryDate: '2026-01-01' },
      { type: 'DRIVING_LICENSE', expiryDate: '2026-11-15' },
    ], TODAY);
    expect(r).toEqual([
      { type: 'DRIVER_CARD', exempt: true, status: null },
      { type: 'DRIVING_LICENSE', exempt: false, status: 'CRITICAL' },
    ]);
  });

  it('a sector without requirements and a Saudi → nothing to show; missing docExemptions is treated as none', () => {
    expect(employeeRequirements('RETAIL', { isSaudi: true }, [], TODAY)).toEqual([]);
    expect(employeeRequirements(null, { isSaudi: false }, [], TODAY)).toEqual([{ type: 'IQAMA', exempt: false, status: 'MISSING' }]);
  });

  it('the profile iqama expiry (idExpiry) counts as an iqama copy for non-Saudis', () => {
    expect(employeeRequirements(null, { isSaudi: false, idExpiry: '2027-06-01' }, [], TODAY)).toEqual([{ type: 'IQAMA', exempt: false, status: 'OK' }]);
    expect(employeeRequirements(null, { isSaudi: false, idExpiry: '2026-11-10T00:00:00.000Z' }, [{ type: 'IQAMA', expiryDate: '2026-01-01' }], TODAY))
      .toEqual([{ type: 'IQAMA', exempt: false, status: 'CRITICAL' }]);
  });

  it('toggleExemption adds/removes one type without duplicates', () => {
    expect(toggleExemption([], 'HEALTH_CERTIFICATE', true)).toEqual(['HEALTH_CERTIFICATE']);
    expect(toggleExemption(['HEALTH_CERTIFICATE'], 'HEALTH_CERTIFICATE', true)).toEqual(['HEALTH_CERTIFICATE']);
    expect(toggleExemption(['IQAMA', 'HEALTH_CERTIFICATE'], 'HEALTH_CERTIFICATE', false)).toEqual(['IQAMA']);
    expect(toggleExemption(undefined, 'DRIVER_CARD', true)).toEqual(['DRIVER_CARD']);
  });
});

describe('sector compliance tab hints and sector documents', () => {
  it('sectorDocTypes uses core requiredDocTypes (sector documents only, no iqama)', () => {
    expect(sectorDocTypes('RESTAURANTS')).toEqual(['HEALTH_CERTIFICATE']);
    expect(sectorDocTypes('logistics')).toEqual(['DRIVER_CARD', 'DRIVING_LICENSE']);
    expect(sectorDocTypes('RETAIL')).toEqual([]);
    expect(sectorDocTypes(null)).toEqual([]);
  });

  it('asks to re-file old «شهادة» health certificates under the new type', () => {
    expect(REFILE_HINT.ar).toContain('«شهادة»');
    expect(REFILE_HINT.ar).toContain('«الشهادة الصحية (بلدي)»');
  });

  it('exemption hint mentions the clinic accountant and GCC nationals without an iqama', () => {
    expect(EXEMPTION_HINT.ar).toContain('محاسب في عيادة');
    expect(EXEMPTION_HINT.ar).toContain('الخليج');
    expect(EXEMPTION_HINT.ar).toContain('الإقامة');
    expect(EXEMPTION_HINT.en).toContain('GCC');
  });
});
