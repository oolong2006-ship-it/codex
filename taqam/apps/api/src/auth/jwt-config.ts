/** Dev/test-only signing key; production must provide its own JWT_SECRET. */
const DEV_FALLBACK = 'taqam-dev-secret';
export const MIN_JWT_SECRET_LENGTH = 32;

/**
 * The JWT signing secret. In production (NODE_ENV=production) a JWT_SECRET of at least 32 characters
 * is required and the API refuses to boot without one; elsewhere the dev fallback keeps local/e2e runs working.
 */
export function jwtSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.JWT_SECRET?.trim();
  if (env.NODE_ENV === 'production') {
    if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(`JWT_SECRET must be set to at least ${MIN_JWT_SECRET_LENGTH} characters in production`);
    }
    return secret;
  }
  return secret || DEV_FALLBACK;
}
