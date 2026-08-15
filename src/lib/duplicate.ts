import { prisma } from "@/lib/prisma";

/** Normalized Levenshtein similarity in [0,1]. */
export function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().replace(/\s+/g, " ").trim();
  const s2 = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}

export interface DuplicateMatch {
  supplierId: string;
  supplierCode: string;
  companyName: string;
  score: number; // 0..100
  reasons: string[];
}

export interface DuplicateInput {
  organizationId: string;
  companyNameEn?: string | null;
  companyNameAr?: string | null;
  crNumber?: string | null;
  vatNumber?: string | null;
  iban?: string | null;
  emailDomain?: string | null;
  primaryPhone?: string | null;
  excludeSupplierId?: string;
}

/**
 * Detect potential duplicate suppliers within the tenant. Exact matches on
 * CR/VAT/IBAN are treated as strong signals; name similarity supplements.
 */
export async function detectDuplicates(
  input: DuplicateInput,
): Promise<DuplicateMatch[]> {
  const candidates = await prisma.supplier.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.excludeSupplierId ? { id: { not: input.excludeSupplierId } } : {}),
    },
    select: {
      id: true,
      supplierCode: true,
      companyNameEn: true,
      companyNameAr: true,
      crNumber: true,
      vatNumber: true,
      iban: true,
      emailDomain: true,
      primaryPhone: true,
    },
  });

  const matches: DuplicateMatch[] = [];
  for (const c of candidates) {
    const reasons: string[] = [];
    let score = 0;

    if (input.crNumber && c.crNumber && input.crNumber === c.crNumber) {
      score = Math.max(score, 100);
      reasons.push("Identical CR number");
    }
    if (input.vatNumber && c.vatNumber && input.vatNumber === c.vatNumber) {
      score = Math.max(score, 100);
      reasons.push("Identical VAT number");
    }
    if (input.iban && c.iban && input.iban === c.iban) {
      score = Math.max(score, 95);
      reasons.push("Identical IBAN");
    }
    if (input.primaryPhone && c.primaryPhone && input.primaryPhone === c.primaryPhone) {
      score = Math.max(score, 80);
      reasons.push("Identical phone number");
    }
    if (input.emailDomain && c.emailDomain && input.emailDomain === c.emailDomain) {
      score = Math.max(score, 60);
      reasons.push(`Shared email domain (${c.emailDomain})`);
    }

    const nameEnSim = input.companyNameEn
      ? similarity(input.companyNameEn, c.companyNameEn)
      : 0;
    const nameArSim = input.companyNameAr
      ? similarity(input.companyNameAr, c.companyNameAr)
      : 0;
    const nameSim = Math.max(nameEnSim, nameArSim);
    if (nameSim >= 0.85) {
      score = Math.max(score, Math.round(nameSim * 100));
      reasons.push(`Company name ${Math.round(nameSim * 100)}% similar`);
    }

    if (score >= 60 && reasons.length > 0) {
      matches.push({
        supplierId: c.id,
        supplierCode: c.supplierCode,
        companyName: c.companyNameEn,
        score,
        reasons,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}
