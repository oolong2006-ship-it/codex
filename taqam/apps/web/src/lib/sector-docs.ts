import { documentCompliance, requiredDocTypes, type DocumentComplianceStatus } from '@taqam/core';

export interface SectorRequirement {
  type: string;
  exempt: boolean;
  /** null when exempted; OK when held and valid for more than 90 days (or without expiry). */
  status: DocumentComplianceStatus | 'OK' | null;
}

/** Sector documents required of one employee (spec §4), with exemption and compliance status — same rules as GET /documents/compliance (profile idExpiry counts as an iqama copy). */
export function employeeRequirements(
  sector: string | null | undefined,
  employee: { isSaudi: boolean; docExemptions?: string[] | null; idExpiry?: string | null },
  documents: { type: string; expiryDate?: string | null }[],
  today: string,
): SectorRequirement[] {
  const exemptions = employee.docExemptions ?? [];
  const issues = documentCompliance({
    sector: sector ?? null,
    today,
    employees: [{ id: 'self', isSaudi: employee.isSaudi, exemptions, idExpiry: employee.idExpiry ? employee.idExpiry.slice(0, 10) : null }],
    documents: documents.map((d) => ({ employeeId: 'self', type: d.type, expiryDate: d.expiryDate ? d.expiryDate.slice(0, 10) : null })),
  });
  return requiredDocTypes(sector ?? null, employee.isSaudi).map((type) => {
    if (exemptions.includes(type)) return { type, exempt: true, status: null };
    return { type, exempt: false, status: issues.find((i) => i.type === type)?.status ?? 'OK' };
  });
}

/** Add or remove one exempted document type (no duplicates). */
export function toggleExemption(current: string[] | null | undefined, type: string, exempt: boolean): string[] {
  const rest = (current ?? []).filter((t) => t !== type);
  return exempt ? [...rest, type] : rest;
}

/** The sector's own documents (what a Saudi employee of that sector must hold — i.e. without the iqama rule). */
export function sectorDocTypes(sector: string | null | undefined): string[] {
  return requiredDocTypes(sector ?? null, true);
}

/** «امتثال القطاع»: health certificates filed under the generic «شهادة» type before this feature are not counted. */
export const REFILE_HINT = {
  ar: 'الشهادات الصحية المسجّلة سابقاً بنوع «شهادة» لا تُحتسب؛ أعد تسجيلها بنوع «الشهادة الصحية (بلدي)».',
  en: 'Health certificates filed earlier as «Certificate» are not counted; re-file them as «Health certificate (Baladi)».',
};

/** When to exempt an employee from a required document. */
export const EXEMPTION_HINT = {
  ar: 'يمكن إعفاء موظف من مستند لا ينطبق عليه من تبويب مستنداته (مثل محاسب في عيادة)، ومن الإقامة لمواطني دول الخليج غير السعوديين لأنهم لا يحملون إقامة.',
  en: 'Exempt an employee from a document that does not apply on their documents tab (e.g. an accountant in a clinic), and from the iqama for non-Saudi GCC nationals, who hold no iqama.',
};
