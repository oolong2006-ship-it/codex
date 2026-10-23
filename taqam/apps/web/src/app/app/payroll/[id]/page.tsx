import { staticParams } from '@/demo/ids';
import PayrollRunClient from './PayrollRunClient';

// Static demo export: pre-render every pooled demo id (see src/demo/ids.ts). Server build: [] → rendered on demand.
export function generateStaticParams() {
  return staticParams.runs();
}

export default function Page() {
  return <PayrollRunClient />;
}
