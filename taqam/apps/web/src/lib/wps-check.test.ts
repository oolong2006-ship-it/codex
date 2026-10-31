import { describe, expect, it } from 'vitest';
import { groupWpsIssues, WPS_CHECK_TITLE, wpsStatusLabel } from './wps-check';
import type { WpsIssue } from './types';

const issue = (code: WpsIssue['code'], severity: WpsIssue['severity'], employeeNumber: string | null = 'EMP-1'): WpsIssue =>
  ({ code, severity, employeeNumber, employeeId: employeeNumber ? 'e1' : null, employeeName: employeeNumber ? 'موظف' : null, messageAr: code });

describe('WPS pre-upload panel copy (spec §2)', () => {
  it('title', () => {
    expect(WPS_CHECK_TITLE.ar).toBe('فحص الملف قبل الرفع إلى مُدد');
  });

  it('badge: «جاهز للرفع» with no errors (warnings do not block), else «X أخطاء تمنع الرفع» with number agreement', () => {
    expect(wpsStatusLabel(0)).toEqual({ ar: 'جاهز للرفع', en: 'Ready to upload' });
    expect(wpsStatusLabel(1)).toEqual({ ar: 'خطأ واحد يمنع الرفع', en: '1 error blocks the upload' });
    expect(wpsStatusLabel(2)).toEqual({ ar: 'خطآن يمنعان الرفع', en: '2 errors block the upload' });
    expect(wpsStatusLabel(3).ar).toBe('3 أخطاء تمنع الرفع');
    expect(wpsStatusLabel(10).ar).toBe('10 أخطاء تمنع الرفع');
    expect(wpsStatusLabel(11).ar).toBe('11 خطأً تمنع الرفع');
  });

  it('groups issues by severity, errors first, dropping empty groups', () => {
    const issues = [issue('LATE_PAYMENT', 'WARNING', null), issue('INVALID_IBAN', 'ERROR'), issue('DEDUCTION_OVER_HALF', 'WARNING')];
    const groups = groupWpsIssues(issues);
    expect(groups.map((g) => g.severity)).toEqual(['ERROR', 'WARNING']);
    expect(groups[0].issues.map((i) => i.code)).toEqual(['INVALID_IBAN']);
    expect(groups[1].issues.map((i) => i.code)).toEqual(['LATE_PAYMENT', 'DEDUCTION_OVER_HALF']);
    expect(groupWpsIssues([issue('LATE_PAYMENT', 'WARNING', null)]).map((g) => g.severity)).toEqual(['WARNING']);
    expect(groupWpsIssues([])).toEqual([]);
  });
});
