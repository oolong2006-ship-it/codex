import type { DocumentStatus } from "@prisma/client";
import { daysUntil } from "@/lib/utils";

export const EXPIRY_ALERT_WINDOWS = [90, 60, 30, 7] as const;

/**
 * Derive a document's lifecycle status from its expiry date, unless it has been
 * explicitly rejected or is still pending manual verification.
 */
export function computeDocumentStatus(
  current: DocumentStatus,
  expiryDate: Date | null | undefined,
): DocumentStatus {
  if (current === "REJECTED") return "REJECTED";
  if (current === "PENDING_VERIFICATION") return "PENDING_VERIFICATION";

  if (!expiryDate) return "VALID";
  const days = daysUntil(expiryDate);
  if (days === null) return "VALID";
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "EXPIRING_SOON";
  return "VALID";
}

/** Which alert window (if any) a document currently falls into. */
export function expiryAlertBucket(expiryDate: Date | null | undefined): number | null {
  const days = daysUntil(expiryDate ?? null);
  if (days === null) return null;
  if (days < 0) return -1; // expired
  for (const w of EXPIRY_ALERT_WINDOWS) {
    if (days <= w) return w;
  }
  return null;
}
