'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Eye } from 'lucide-react';
import { api, getToken, setToken } from '@/lib/api';
import { useAuth, type AuthResponse } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { withBase } from '@/lib/paths';
import { ADMIN_TOKEN_KEY } from '@/lib/adminTypes';

export function getAdminToken(): string | null {
  try { return window.localStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; }
}
export function clearAdminToken() {
  try { window.localStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* storage unavailable */ }
}

/** Switch the browser session to the company OWNER (keeps the admin token aside) and open /app. */
export async function impersonateCompany(companyId: string) {
  const r = await api.post<AuthResponse>(`/admin/companies/${companyId}/impersonate`);
  const current = getToken();
  try { if (current) window.localStorage.setItem(ADMIN_TOKEN_KEY, current); } catch { /* storage unavailable */ }
  setToken(r.accessToken);
  window.location.href = withBase('/app');
}

/** Restore the platform admin session and go back to /admin. */
export function returnToAdmin() {
  const admin = getAdminToken();
  clearAdminToken();
  setToken(admin);
  window.location.href = withBase(admin ? '/admin' : '/login');
}

/** Sticky strip shown in the company dashboard while a platform admin browses as the owner. */
export function ImpersonationBanner() {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const [active, setActive] = useState(false);
  useEffect(() => { setActive(!!getAdminToken()); }, [user?.id]);
  if (!active || !user || user.role === 'SUPER_ADMIN') return null;
  const company = user.company ? (lang === 'en' ? user.company.nameEn || user.company.nameAr : user.company.nameAr) : '';
  return (
    <div role="status" className="flex min-h-10 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#0F2747] px-4 py-1.5 text-xs text-white sm:text-sm print:hidden">
      <span className="inline-flex items-center gap-1.5">
        <Eye className="h-4 w-4 shrink-0 text-accent" />
        <span>{t('أنت تتصفح كـ', 'You are browsing as')} <b className="font-semibold">{user.name}</b>{company && <> — <span className="text-white/80">{company}</span></>}</span>
      </span>
      <button type="button" onClick={returnToAdmin}
        className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-[#0F2747] hover:bg-accent-600 hover:text-white">
        <ArrowRight className="h-3.5 w-3.5 ltr:rotate-180" />{t('العودة إلى بوابة المنصة', 'Back to platform portal')}
      </button>
    </div>
  );
}
