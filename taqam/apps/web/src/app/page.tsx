import { MarketingShell } from '@/components/marketing/MarketingShell';
import { HomePage } from '@/components/marketing/HomePage';
import { pageMeta } from '@/components/marketing/seo';

export const metadata = pageMeta(
  'طاقم | كل فروعك… فريق واحد — الموارد البشرية والرواتب للمنشآت متعددة الفروع',
  'طاقم منصة سعودية للموارد البشرية والرواتب مصممة للمنشآت متعددة الفروع: حضور بالموقع لكل فرع، ورديات، إجازات، مسير رواتب وملف حماية الأجور، سعودة لكل فرع، وتطبيق خدمة ذاتية للموظف.',
  '/',
  { absoluteTitle: true },
);

export default function Home() {
  return (
    <MarketingShell>
      <HomePage />
    </MarketingShell>
  );
}
