// Arabic/English labels for API enums (keys exactly as in docs/API_CONTRACT.md).
type L = Record<string, [ar: string, en: string]>;
export const ROLE: L = { OWNER: ['المالك', 'Owner'], HR_ADMIN: ['مدير الموارد البشرية', 'HR Admin'], PAYROLL: ['مسؤول الرواتب', 'Payroll'], BRANCH_MANAGER: ['مدير فرع', 'Branch Manager'], EMPLOYEE: ['موظف', 'Employee'] };
export const EMPLOYEE_STATUS: L = { ACTIVE: ['على رأس العمل', 'Active'], ON_LEAVE: ['في إجازة', 'On leave'], TERMINATED: ['منتهية خدمته', 'Terminated'] };
export const REQUEST_STATUS: L = { PENDING: ['قيد الاعتماد', 'Pending'], APPROVED: ['معتمد', 'Approved'], REJECTED: ['مرفوض', 'Rejected'], CANCELLED: ['ملغى', 'Cancelled'] };
export const ATTENDANCE_STATUS: L = { PRESENT: ['حاضر', 'Present'], LATE: ['متأخر', 'Late'], ABSENT: ['غائب', 'Absent'], ON_LEAVE: ['إجازة', 'On leave'], INCOMPLETE: ['غير مكتمل', 'Incomplete'], OFF: ['راحة', 'Off'], HOLIDAY: ['عطلة', 'Holiday'] };
export const REQUEST_TYPE: L = { SALARY_CERTIFICATE: ['تعريف بالراتب', 'Salary certificate'], EXPENSE_CLAIM: ['مطالبة مصروفات', 'Expense claim'], LOAN: ['سلفة', 'Loan'], EXIT_REENTRY: ['خروج وعودة', 'Exit / re-entry'], ATTENDANCE_CORRECTION: ['تصحيح حضور', 'Attendance correction'], LETTER: ['خطاب', 'Letter'], OTHER: ['أخرى', 'Other'] };
export const PAYROLL_STATUS: L = { DRAFT: ['مسودة', 'Draft'], CALCULATED: ['محسوب', 'Calculated'], APPROVED: ['معتمد', 'Approved'], PAID: ['مدفوع', 'Paid'] };
export const DOC_TYPE: L = { IQAMA: ['إقامة / هوية', 'Iqama / ID'], PASSPORT: ['جواز سفر', 'Passport'], CONTRACT: ['عقد عمل', 'Contract'], CERTIFICATE: ['شهادة', 'Certificate'], INSURANCE: ['تأمين طبي', 'Medical insurance'], OTHER: ['أخرى', 'Other'] };
export const EXPIRY_STATUS: L = { EXPIRED: ['منتهي', 'Expired'], CRITICAL: ['ينتهي خلال 30 يوماً', '≤ 30 days'], WARNING: ['ينتهي خلال 90 يوماً', '≤ 90 days'], OK: ['ساري', 'Valid'], NONE: ['—', '—'] };
export const TERMINATION_REASON: L = { EMPLOYER_TERMINATION: ['إنهاء من صاحب العمل', 'Employer termination'], CONTRACT_END: ['انتهاء العقد', 'Contract end'], RESIGNATION: ['استقالة', 'Resignation'], ARTICLE_80: ['فصل وفق المادة 80', 'Article 80 dismissal'], ARTICLE_81: ['ترك العمل وفق المادة 81', 'Article 81'], FORCE_MAJEURE: ['قوة قاهرة', 'Force majeure'], FEMALE_MARRIAGE_CHILDBIRTH: ['زواج أو وضع (للعاملة)', 'Marriage / childbirth (female)'], RETIREMENT: ['تقاعد', 'Retirement'], DEATH: ['وفاة', 'Death'] };
export const NITAQAT_BAND: L = { PLATINUM: ['بلاتيني', 'Platinum'], HIGH_GREEN: ['أخضر مرتفع', 'High green'], MID_GREEN: ['أخضر متوسط', 'Mid green'], LOW_GREEN: ['أخضر منخفض', 'Low green'], RED: ['أحمر', 'Red'] };
export const CANDIDATE_STAGE: L = { APPLIED: ['متقدم', 'Applied'], SCREENING: ['فرز', 'Screening'], INTERVIEW: ['مقابلة', 'Interview'], OFFER: ['عرض وظيفي', 'Offer'], HIRED: ['تم التعيين', 'Hired'], REJECTED: ['مستبعد', 'Rejected'] };
export const SECTOR: L = { RESTAURANTS: ['المطاعم والمقاهي', 'Restaurants & cafés'], RETAIL: ['التجزئة', 'Retail'], CONTRACTING: ['المقاولات', 'Contracting'], HEALTHCARE: ['العيادات والصحة', 'Clinics & healthcare'], LOGISTICS: ['النقل والخدمات اللوجستية', 'Logistics'], OTHER: ['أخرى', 'Other'] };

export function label(map: L, key: string | null | undefined, lang: 'ar' | 'en' = 'ar') {
  if (!key) return '—';
  const v = map[key];
  return v ? (lang === 'ar' ? v[0] : v[1]) : key;
}
