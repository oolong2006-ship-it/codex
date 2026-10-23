import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/components/marketing/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/app/', '/me/', '/login', '/signup', '/api/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
