import { FeaturesPage } from '@/components/marketing/FeaturesPage';
import { pageMeta } from '@/components/marketing/seo';

export const metadata = pageMeta(
  'المزايا — كل وحدات الموارد البشرية والرواتب',
  'تعرّف على وحدات شؤون: الفروع والنطاق الجغرافي، الحضور والورديات، الإجازات، الطلبات، الرواتب وملف حماية الأجور، نهاية الخدمة، السعودة، الأداء، التوظيف، والتقارير.',
  '/features',
);

export default function Page() {
  return <FeaturesPage />;
}
