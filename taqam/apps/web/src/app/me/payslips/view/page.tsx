'use client';
import { useEffect, useState } from 'react';
import { PayslipDetail } from '@/components/ess/PayslipDetail';

/** Query-string variant of the payslip page (/me/payslips/view?id=…) used by the static demo export. */
export default function PayslipViewPage() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { setId(new URLSearchParams(window.location.search).get('id') ?? ''); }, []);
  if (id === null) return null;
  return <PayslipDetail id={id} />;
}
