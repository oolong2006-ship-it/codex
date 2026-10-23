import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/components/marketing/seo';

// Static (also required by the static demo export).
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/app/', '/me/', '/login', '/signup', '/api/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
