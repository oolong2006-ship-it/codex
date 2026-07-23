'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setSession, ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLang } from '@/lib/lang-context';
import { LangToggle } from '@/components/LangToggle';

const DEMO_ACCOUNTS = [
  'superadmin@masar34.sa',
  'admin@masar34.sa',
  'operations@masar34.sa',
  'operator@masar34.sa',
  'supervisor@masar34.sa',
  'analyst@masar34.sa',
  'partner@masar34.sa',
];

export default function LoginPage() {
  const { lang } = useLang();
  const router = useRouter();
  const [email, setEmail] = useState('operations@masar34.sa');
  const [password, setPassword] = useState('Masar34!Demo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.login(email, password);
      setSession(res.accessToken, res.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? t('invalidCredentials', lang)
          : t('error', lang),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-masar-900 via-masar-700 to-masar-500 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-900">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-masar-700 dark:text-masar-300">
              {t('appName', lang)}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{t('tagline', lang)}</p>
          </div>
          <LangToggle />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('email', lang)}</label>
            <select
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {DEMO_ACCOUNTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('password', lang)}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-masar-600 py-2.5 font-semibold text-white transition hover:bg-masar-700 disabled:opacity-60"
          >
            {loading ? t('signingIn', lang) : t('signIn', lang)}
          </button>
        </form>

        <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {t('demoNote', lang)}
        </p>
      </div>
    </main>
  );
}
