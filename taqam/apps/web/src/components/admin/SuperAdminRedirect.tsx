'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/** Sends a SUPER_ADMIN who lands in a company area (/me) to the platform portal. */
export function SuperAdminRedirect({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isSuper = !loading && user?.role === 'SUPER_ADMIN';
  useEffect(() => { if (isSuper) router.replace('/admin'); }, [isSuper, router]);
  if (isSuper) return <div className="min-h-screen bg-sand" />;
  return <>{children}</>;
}
