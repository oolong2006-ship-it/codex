/** WPS / Mudad pre-upload panel copy and grouping (spec §2). Pure, no I/O. */
import { arCount, type ArForms, type Bilingual } from './saudization';
import type { WpsIssue } from './types';

export const WPS_CHECK_TITLE: Bilingual = { ar: 'فحص الملف قبل الرفع إلى مُدد', en: 'Pre-upload check for Mudad' };

const ERRORS: ArForms = { one: 'خطأ واحد', two: 'خطآن', few: 'أخطاء', many: 'خطأً' };

/** «جاهز للرفع» when nothing blocks the upload (warnings never block), else «X أخطاء تمنع الرفع». */
export function wpsStatusLabel(errors: number): Bilingual {
  if (errors <= 0) return { ar: 'جاهز للرفع', en: 'Ready to upload' };
  const verb = errors === 1 ? 'يمنع' : errors === 2 ? 'يمنعان' : 'تمنع';
  return { ar: `${arCount(errors, ERRORS)} ${verb} الرفع`, en: `${errors} error${errors === 1 ? '' : 's'} block${errors === 1 ? 's' : ''} the upload` };
}

/** Issues grouped by severity — ERROR first — keeping the checker's order inside each group. */
export function groupWpsIssues(issues: WpsIssue[]): { severity: WpsIssue['severity']; issues: WpsIssue[] }[] {
  return (['ERROR', 'WARNING'] as const)
    .map((severity) => ({ severity, issues: issues.filter((i) => i.severity === severity) }))
    .filter((g) => g.issues.length > 0);
}

/** English wording for each issue (the API's messageAr is the Arabic). */
export const WPS_ISSUE_EN: Record<WpsIssue['code'], string> = {
  INVALID_IBAN: 'Invalid IBAN',
  MISSING_NATIONAL_ID: 'National ID / Iqama number missing',
  NON_POSITIVE_NET: 'Net salary must be greater than zero',
  DUPLICATE_NATIONAL_ID: 'ID number duplicated in the file',
  EMPLOYEE_MISSING_FROM_RUN: 'Active employee missing from the run',
  NET_MISMATCH: 'Net does not equal gross minus deductions',
  DEDUCTION_OVER_HALF: 'Deductions exceed half of the wage (Art. 92)',
  PAID_BELOW_CONTRACT: 'Basic paid is below the contract with no recorded absence',
  LATE_PAYMENT: 'Payment date is more than 7 days after the month end',
};
