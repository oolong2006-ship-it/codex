import { staticParams } from '@/demo/ids';
import JobBoardClient from './JobBoardClient';

// Static demo export: pre-render every pooled demo id (see src/demo/ids.ts). Server build: [] → rendered on demand.
export function generateStaticParams() {
  return staticParams.jobs();
}

export default function Page() {
  return <JobBoardClient />;
}
