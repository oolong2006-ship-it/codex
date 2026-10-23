import { staticParams } from '@/demo/ids';
import EmployeeDetailClient from './EmployeeDetailClient';

// Static demo export: pre-render every pooled demo id (see src/demo/ids.ts). Server build: [] → rendered on demand.
export function generateStaticParams() {
  return staticParams.employees();
}

export default function Page() {
  return <EmployeeDetailClient />;
}
