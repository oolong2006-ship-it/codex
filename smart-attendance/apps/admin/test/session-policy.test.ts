import { describe, expect, it } from 'vitest';
import { sessionAction } from '../lib/session-policy';

describe('sessionAction', () => {
  it('lets public pages through without a session', () => {
    expect(sessionAction({ isPublic: true, hasAccess: false, hasRefresh: false })).toBe('allow');
  });

  it('lets a request with a fresh access token through', () => {
    expect(sessionAction({ isPublic: false, hasAccess: true, hasRefresh: true })).toBe('allow');
  });

  it('refreshes when only the refresh token remains', () => {
    expect(sessionAction({ isPublic: false, hasAccess: false, hasRefresh: true })).toBe('refresh');
  });

  it('sends everyone else to login', () => {
    expect(sessionAction({ isPublic: false, hasAccess: false, hasRefresh: false })).toBe('login');
  });
});
