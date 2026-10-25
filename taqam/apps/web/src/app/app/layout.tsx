'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { goToLogin, useAuth } from '@/lib/auth';
import { PageLoader } from '@/components/ui';
import { AppShell } from '@/components/app/AppShell';
import { navItemFor } from '@/components/app/nav';
import { NoAccess } from '@/components/app/primitives';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) goToLogin(pathname);
    else if (user.role === 'SUPER_ADMIN') router.replace('/admin');
    else if (user.role === 'EMPLOYEE') router.replace('/me');
  }, [user, loading, router, pathname]);

  if (loading || !user || user.role === 'EMPLOYEE' || user.role === 'SUPER_ADMIN') {
    return <div className="min-h-screen bg-sand"><PageLoader /></div>;
  }
  const item = navItemFor(pathname);
  const allowed = !item || item.roles.includes(user.role);
  return <AppShell>{allowed ? children : <NoAccess />}</AppShell>;
}
