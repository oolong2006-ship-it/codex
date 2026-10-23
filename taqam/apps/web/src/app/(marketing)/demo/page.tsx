import { DemoPage } from '@/components/marketing/DemoPage';
import { pageMeta } from '@/components/marketing/seo';

export const metadata = pageMeta(
  'اطلب عرضاً تجريبياً',
  'احجز عرضاً تجريبياً مخصصاً لمنشأتك مع مختص من طاقم، وشاهد كيف تُدار الورديات والحضور والرواتب لفروعك في 30 دقيقة.',
  '/demo',
);

export default function Page() {
  return <DemoPage />;
}
