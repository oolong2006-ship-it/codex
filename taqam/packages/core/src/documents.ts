import { DateInput, diffDays, toUtcDate } from './dates';

/** Whole days from `from` (default: today, UTC) until `date`; negative if past. */
export function daysUntil(date: DateInput, from?: DateInput): number {
  return diffDays(from ?? new Date(), toUtcDate(date));
}

export type ExpiryStatus = 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'OK' | 'NONE';

/** <0 EXPIRED, <=30 CRITICAL, <=90 WARNING, >90 OK, null/undefined NONE. */
export function expiryStatus(date: DateInput | null | undefined, from?: DateInput): ExpiryStatus {
  if (date === null || date === undefined || date === '') return 'NONE';
  const d = daysUntil(date, from);
  if (d < 0) return 'EXPIRED';
  if (d <= 30) return 'CRITICAL';
  if (d <= 90) return 'WARNING';
  return 'OK';
}

// ---------- Sector documents compliance (spec §4) ----------

/** Company sector as stored on Company.sector (free string; these are the known keys). */
export type SectorKey = 'RESTAURANTS' | 'RETAIL' | 'CONTRACTING' | 'HEALTHCARE' | 'LOGISTICS' | string;

/** Regulator documents added for sector compliance: Baladi health certificate, SCFHS licence, TGA driver card, driving licence. */
export const SECTOR_DOC_TYPES = ['HEALTH_CERTIFICATE', 'PROFESSIONAL_LICENSE', 'DRIVER_CARD', 'DRIVING_LICENSE'] as const;

/** Documents every employee of a sector must hold (unless exempted). Non-Saudis additionally need an IQAMA in every sector. */
export const SECTOR_REQUIRED_DOCS: Record<string, string[]> = {
  RESTAURANTS: ['HEALTH_CERTIFICATE'],
  HEALTHCARE: ['PROFESSIONAL_LICENSE'],
  LOGISTICS: ['DRIVER_CARD', 'DRIVING_LICENSE'],
};

/** Document types required of one employee: IQAMA for non-Saudis, then the sector's documents. */
export function requiredDocTypes(sector: SectorKey | null, isSaudi: boolean): string[] {
  const bySector = sector ? SECTOR_REQUIRED_DOCS[sector.trim().toUpperCase()] ?? [] : [];
  return [...(isSaudi ? [] : ['IQAMA']), ...bySector];
}

export type DocumentComplianceStatus = 'MISSING' | 'EXPIRED' | 'CRITICAL' | 'WARNING';

export interface DocumentComplianceInput {
  sector: SectorKey | null;
  today: string;
  /** idExpiry: Employee.idExpiry — for non-Saudis the iqama expiry kept on the profile; counted as one more IQAMA copy. */
  employees: { id: string; isSaudi: boolean; exemptions: string[]; idExpiry?: string | null }[];
  documents: { employeeId: string; type: string; expiryDate: string | null }[];
}

export interface DocumentComplianceItem {
  employeeId: string;
  type: string;
  status: DocumentComplianceStatus;
}

/**
 * Required documents that are missing or expiring, per employee (employee order, then required-type order).
 * Per type the copy with the latest expiry wins; a copy without expiry satisfies the requirement.
 * A non-Saudi's profile iqama expiry (Employee.idExpiry) is folded in as one more IQAMA copy.
 * OK (> 90 days) and non-expiring documents are omitted.
 */
export function documentCompliance(input: DocumentComplianceInput): DocumentComplianceItem[] {
  // best expiry per employee+type: null = present without expiry (beats any date)
  const best = new Map<string, string | null>();
  const copies = [
    ...input.documents,
    ...input.employees.filter((e) => !e.isSaudi && e.idExpiry).map((e) => ({ employeeId: e.id, type: 'IQAMA', expiryDate: e.idExpiry!.slice(0, 10) })),
  ];
  for (const d of copies) {
    const key = `${d.employeeId}|${d.type}`;
    const exp = d.expiryDate === '' ? null : d.expiryDate;
    if (!best.has(key)) best.set(key, exp);
    else {
      const cur = best.get(key)!;
      if (cur !== null && (exp === null || exp > cur)) best.set(key, exp);
    }
  }
  const out: DocumentComplianceItem[] = [];
  for (const e of input.employees) {
    const exempt = new Set(e.exemptions);
    for (const type of requiredDocTypes(input.sector, e.isSaudi)) {
      if (exempt.has(type)) continue;
      const key = `${e.id}|${type}`;
      if (!best.has(key)) {
        out.push({ employeeId: e.id, type, status: 'MISSING' });
        continue;
      }
      const s = expiryStatus(best.get(key), input.today);
      if (s === 'EXPIRED' || s === 'CRITICAL' || s === 'WARNING') out.push({ employeeId: e.id, type, status: s });
    }
  }
  return out;
}
