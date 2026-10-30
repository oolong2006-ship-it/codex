import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { isAuthError, serverApi } from '../../lib/server-api';
import { hasAdminSurface, navFor } from '../../lib/nav';
import { logoutAction } from '../actions/session';

export const dynamic = 'force-dynamic';

interface Me {
  userId: string;
  tenantId: string | null;
  employeeId: string | null;
  roles: { role: string; branchId: string | null }[];
  permissions: string[];
}

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  let me: Me;
  try {
    me = await serverApi<Me>('/v1/me');
  } catch (error) {
    if (isAuthError(error)) redirect('/login');
    throw error;
  }

  const items = navFor(me.permissions);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">لوحة الحضور</div>
        <nav aria-label="القائمة الرئيسية">
          {items.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <form action={logoutAction} style={{ marginTop: '1rem' }}>
          <button type="submit" className="secondary">تسجيل الخروج</button>
        </form>
      </aside>
      <main>
        {hasAdminSurface(me.permissions) ? (
          children
        ) : (
          <section>
            <h1>هذه الواجهة للإدارة والمدراء</h1>
            <p className="muted">استخدم تطبيق الجوال لتسجيل بصمتك وعرض سجلك.</p>
          </section>
        )}
      </main>
    </div>
  );
}
