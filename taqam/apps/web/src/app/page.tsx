import { MarketingShell } from '@/components/marketing/MarketingShell';
import { HomePage } from '@/components/marketing/HomePage';
import { pageMeta } from '@/components/marketing/seo';

export const metadata = pageMeta(
  'شؤون | كل شؤون موظفيك، في مكان واحد — منصة شؤون لإدارة الموارد البشرية',
  'شؤون منصة سعودية للموارد البشرية والرواتب مصممة للمنشآت متعددة الفروع: حضور بالموقع لكل فرع، ورديات، إجازات، مسير رواتب وملف حماية الأجور، سعودة لكل فرع، وتطبيق خدمة ذاتية للموظف.',
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
