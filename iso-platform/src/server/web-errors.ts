import { notFound } from "next/navigation";
import { isDomainError } from "./errors";

/** Maps NOT_FOUND / FORBIDDEN domain errors to a 404 so cross-tenant ids reveal nothing. */
export function notFoundOnMissing(e: unknown): never {
  if (isDomainError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
  // invalid uuid in the URL
  if (e && typeof e === "object" && (e as { code?: string }).code === "22P02") notFound();
  throw e;
}
