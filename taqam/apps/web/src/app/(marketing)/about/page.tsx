import { AboutPage } from '@/components/marketing/AboutPage';
import { pageMeta } from '@/components/marketing/seo';

export const metadata = pageMeta(
  'عن شؤون',
  'شؤون شركة سعودية تبني منصة موارد بشرية ورواتب للمنشآت متعددة الفروع، بالعربية أولاً، مع ممارسات واضحة لحماية البيانات الشخصية.',
  '/about',
);

export default function Page() {
  return <AboutPage />;
}
