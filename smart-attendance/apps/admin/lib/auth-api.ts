import { apiRequest, readJson } from './api-client';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export type LoginOutcome = ({ status: 'OK' } & TokenPair) | { status: 'MFA_REQUIRED' | 'MFA_ENROLLMENT_REQUIRED'; mfa_token: string };

export function login(identifier: string, password: string, fetchImpl?: typeof fetch): Promise<LoginOutcome> {
  return apiRequest('/v1/auth/login', { method: 'POST', body: { identifier, password } }, fetchImpl).then((r) => readJson<LoginOutcome>(r));
}

export function refreshTokens(refreshToken: string, fetchImpl?: typeof fetch): Promise<TokenPair> {
  return apiRequest('/v1/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } }, fetchImpl).then((r) => readJson<TokenPair>(r));
}

export function enrollMfa(mfaToken: string, fetchImpl?: typeof fetch): Promise<{ secret: string; otpauth_url: string }> {
  return apiRequest('/v1/auth/mfa/enroll', { method: 'POST', body: { mfa_token: mfaToken } }, fetchImpl).then((r) =>
    readJson<{ secret: string; otpauth_url: string }>(r),
  );
}

export function verifyMfa(mfaToken: string, code: string, fetchImpl?: typeof fetch): Promise<TokenPair> {
  return apiRequest('/v1/auth/mfa/verify', { method: 'POST', body: { mfa_token: mfaToken, code } }, fetchImpl).then((r) => readJson<TokenPair>(r));
}

export function logoutRefresh(refreshToken: string, fetchImpl?: typeof fetch): Promise<void> {
  return apiRequest('/v1/auth/logout', { method: 'POST', body: { refresh_token: refreshToken } }, fetchImpl).then((r) => readJson<void>(r));
}
