import { notFound } from 'next/navigation';
import { SectorPage } from '@/components/marketing/SectorPage';
import { SECTORS, getSector } from '@/components/marketing/data';
import { pageMeta } from '@/components/marketing/seo';

export const dynamicParams = false;

export function generateStaticParams() {
  return SECTORS.map((s) => ({ sector: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ sector: string }> }) {
  const { sector } = await params;
  const s = getSector(sector);
  if (!s) return {};
  return pageMeta(`حلول ${s.name[0]} — الموارد البشرية والرواتب`, `${s.headline[0]}. ${s.intro[0]}`, `/solutions/${s.slug}`);
}

export default async function Page({ params }: { params: Promise<{ sector: string }> }) {
  const { sector } = await params;
  const s = getSector(sector);
  if (!s) notFound();
  return <SectorPage slug={s.slug} />;
}
