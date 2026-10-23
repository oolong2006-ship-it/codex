import type { Metadata } from 'next';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { HomePage } from '@/components/marketing/HomePage';

export const metadata: Metadata = {
  title: { absolute: 'طاقم | كل فروعك… فريق واحد — الموارد البشرية والرواتب للمنشآت متعددة الفروع' },
  description: 'طاقم منصة سعودية للموارد البشرية والرواتب مصممة للمنشآت متعددة الفروع: حضور بالموقع لكل فرع، ورديات، إجازات، مسير رواتب وملف حماية الأجور، سعودة لكل فرع، وتطبيق خدمة ذاتية للموظف.',
  alternates: { canonical: '/' },
  openGraph: { title: 'طاقم | كل فروعك… فريق واحد', description: 'الموارد البشرية والرواتب والحضور للمنشآت متعددة الفروع في السعودية.', locale: 'ar_SA', type: 'website' },
};

export default function Home() {
  return (
    <MarketingShell>
      <HomePage />
    </MarketingShell>
  );
}
