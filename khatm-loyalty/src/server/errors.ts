/**
 * Domain error carrying a translation key. Routes and actions map it to an
 * Arabic/English message; it never leaks internals to the user.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
    public readonly params: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = "AppError";
  }
}

export const notFound = () => new AppError("errors.notFound", 404);
export const forbidden = () => new AppError("errors.forbidden", 403);
