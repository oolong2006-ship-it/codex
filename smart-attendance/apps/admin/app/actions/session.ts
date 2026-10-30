'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { logoutRefresh } from '../../lib/auth-api';
import { COOKIE_ACCESS, COOKIE_REFRESH } from '../../lib/config';

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const refresh = store.get(COOKIE_REFRESH)?.value;
  if (refresh) await logoutRefresh(refresh).catch(() => undefined);
  store.delete(COOKIE_ACCESS);
  store.delete(COOKIE_REFRESH);
  redirect('/login');
}
