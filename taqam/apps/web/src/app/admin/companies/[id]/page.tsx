import { staticParams } from '@/demo/ids';
import CompanyDetailClient from './CompanyDetailClient';

// Static demo export: pre-render every pooled company id (COMPANY_IDS in src/demo/ids.ts). Server build: [] → rendered on demand.
export function generateStaticParams() {
  return staticParams.companies();
}

export default function Page() {
  return <CompanyDetailClient />;
}
