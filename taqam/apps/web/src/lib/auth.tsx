'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import { withBase } from './paths';

export type Role = 'OWNER' | 'HR_ADMIN' | 'PAYROLL' | 'BRANCH_MANAGER' | 'EMPLOYEE' | 'SUPER_ADMIN';
export interface SessionUser {
  id: string; email: string; name: string; role: Role;
  companyId: string | null; employeeId: string | null; branchId: string | null;
  company?: { id: string; nameAr: string; nameEn?: string; status?: string } | null;
}
export interface AuthResponse { accessToken: string; user: SessionUser; company: { id: string; nameAr: string; nameEn?: string } }

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (body: Record<string, unknown>) => Promise<SessionUser>;
  logout: () => void;
  refresh: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export const ADMIN_ROLES: Role[] = ['OWNER', 'HR_ADMIN'];
export function hasRole(user: SessionUser | null, roles: Role[]) { return !!user && roles.includes(user.role); }
/** Where a user lands after login. */
export function homeFor(user: SessionUser) { return user.role === 'SUPER_ADMIN' ? '/admin' : user.role === 'EMPLOYEE' ? '/me' : '/app'; }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try { setUser(await api.get<SessionUser>('/auth/me')); }
    catch { setToken(null); setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const accept = (r: AuthResponse) => {
    setToken(r.accessToken);
    const u = { ...r.user, company: r.company };
    setUser(u);
    return u;
  };
  const login = async (email: string, password: string) => accept(await api.post<AuthResponse>('/auth/login', { email, password }));
  const register = async (body: Record<string, unknown>) => accept(await api.post<AuthResponse>('/auth/register', body));
  // Full page load to /login. Keep `user` set until the page unloads: clearing it first makes the shells'
  // auth guards start a client-side router.replace('/login') that the unload aborts, and Next's static
  // export then falls back to loading the route's RSC payload (login/index.txt) as the page.
  const logout = () => {
    setToken(null);
    if (typeof window === 'undefined') { setUser(null); return; }
    window.location.replace(withBase(process.env.NEXT_PUBLIC_DEMO === '1' ? '/login/' : '/login'));
  };

  return <Ctx.Provider value={{ user, loading, login, register, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
