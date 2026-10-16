export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "ILLEGAL_TRANSITION"
  | "SEGREGATION_OF_DUTIES"
  | "GATE_BLOCKED";

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;
