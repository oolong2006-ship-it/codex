import { AboutPage } from '@/components/marketing/AboutPage';
import { pageMeta } from '@/components/marketing/seo';

export const metadata = pageMeta(
  'عن طاقم',
  'طاقم شركة سعودية تبني منصة موارد بشرية ورواتب للمنشآت متعددة الفروع، بالعربية أولاً، مع التزام بحماية البيانات الشخصية واستضافتها داخل المملكة.',
  '/about',
);

export default function Page() {
  return <AboutPage />;
}
