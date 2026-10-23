import { IS_DEMO_EXPORT } from '@/demo/ids';
import { PayslipRoute } from './PayslipRoute';

// The static demo links payslips through /me/payslips/view?id= (ids are not known at build time), so only a placeholder is exported.
export function generateStaticParams() {
  return IS_DEMO_EXPORT ? [{ id: '_' }] : [];
}

export default function Page() {
  return <PayslipRoute />;
}
