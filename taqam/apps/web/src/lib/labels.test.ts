import { describe, expect, it } from 'vitest';
import { SECTOR_DOC_TYPES } from '@taqam/core';
import { DOCUMENT_TYPES } from '@/demo/routes-core';
import { DOC_COMPLIANCE_STATUS, DOC_TYPE, SECTOR_DOC_HINT, label } from './labels';

describe('document type labels (spec §4)', () => {
  it('labels the four sector documents exactly', () => {
    expect(label(DOC_TYPE, 'HEALTH_CERTIFICATE', 'ar')).toBe('الشهادة الصحية (بلدي)');
    expect(label(DOC_TYPE, 'PROFESSIONAL_LICENSE', 'ar')).toBe('ترخيص مزاولة المهنة');
    expect(label(DOC_TYPE, 'DRIVER_CARD', 'ar')).toBe('بطاقة سائق (هيئة النقل)');
    expect(label(DOC_TYPE, 'DRIVING_LICENSE', 'ar')).toBe('رخصة القيادة');
    for (const k of SECTOR_DOC_TYPES) expect(DOC_TYPE[k][1]).toBeTruthy();
  });

  it('keeps the existing labels and covers every DocumentType the API accepts (one select list for all forms)', () => {
    expect(label(DOC_TYPE, 'IQAMA', 'ar')).toBe('إقامة / هوية');
    expect(label(DOC_TYPE, 'CERTIFICATE', 'ar')).toBe('شهادة');
    expect(Object.keys(DOC_TYPE).sort()).toEqual([...DOCUMENT_TYPES].sort());
  });

  it('labels every compliance status', () => {
    expect(Object.keys(DOC_COMPLIANCE_STATUS).sort()).toEqual(['CRITICAL', 'EXPIRED', 'MISSING', 'WARNING']);
    expect(label(DOC_COMPLIANCE_STATUS, 'MISSING', 'ar')).toBe('غير موجود');
  });

  it('explains which regulator requires each sector document', () => {
    expect(SECTOR_DOC_HINT.HEALTH_CERTIFICATE[0]).toContain('بلدي');
    expect(SECTOR_DOC_HINT.PROFESSIONAL_LICENSE[0]).toContain('الهيئة السعودية للتخصصات الصحية');
    expect(SECTOR_DOC_HINT.DRIVER_CARD[0]).toContain('هيئة النقل العام');
    expect(Object.keys(SECTOR_DOC_HINT).sort()).toEqual([...SECTOR_DOC_TYPES].sort());
  });
});

describe('anti-tamper attendance labels', () => {
  it('flags and device statuses read naturally in Arabic', async () => {
    const { ATTENDANCE_FLAG, DEVICE_STATUS, label } = await import('./labels');
    expect(label(ATTENDANCE_FLAG, 'OFFLINE', 'ar')).toBe('دون اتصال');
    expect(label(ATTENDANCE_FLAG, 'NEW_DEVICE_APPROVED', 'ar')).toBe('جهاز جديد');
    expect(label(ATTENDANCE_FLAG, 'NO_BRANCH_CODE', 'ar')).toBe('بدون رمز الفرع');
    expect(label(DEVICE_STATUS, 'PENDING', 'ar')).toBe('بانتظار الاعتماد');
  });
});
