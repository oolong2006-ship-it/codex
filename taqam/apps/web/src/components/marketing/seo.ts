import type { Metadata } from 'next';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://shuoon.sa').replace(/\/$/, '');

/** Per-page SEO metadata (Arabic-first). */
export function pageMeta(title: string, description: string, path: string, opts: { absoluteTitle?: boolean } = {}): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title: opts.absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { title: opts.absoluteTitle ? title : `${title} | شؤون`, description, url: path, siteName: 'شؤون', locale: 'ar_SA', type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}
