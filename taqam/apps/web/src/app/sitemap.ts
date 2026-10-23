import type { MetadataRoute } from 'next';
import { SECTORS } from '@/components/marketing/data';
import { SITE_URL } from '@/components/marketing/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-10-01');
  const pages: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '', priority: 1, freq: 'weekly' },
    { path: '/features', priority: 0.9, freq: 'monthly' },
    { path: '/pricing', priority: 0.9, freq: 'monthly' },
    { path: '/demo', priority: 0.8, freq: 'yearly' },
    { path: '/tools/end-of-service', priority: 0.9, freq: 'monthly' },
    ...SECTORS.map((s) => ({ path: `/solutions/${s.slug}`, priority: 0.8, freq: 'monthly' as const })),
    { path: '/about', priority: 0.5, freq: 'yearly' },
    { path: '/privacy', priority: 0.3, freq: 'yearly' },
    { path: '/terms', priority: 0.3, freq: 'yearly' },
  ];
  return pages.map((p) => ({ url: `${SITE_URL}${p.path}`, lastModified, changeFrequency: p.freq, priority: p.priority }));
}
