'use client';
import { useParams } from 'next/navigation';
import { PayslipDetail } from '@/components/ess/PayslipDetail';

export function PayslipRoute() {
  const { id } = useParams<{ id: string }>();
  return <PayslipDetail id={id} />;
}
