import { LegalPage } from '@/components/marketing/LegalPage';
import { LEGAL_UPDATED, TERMS } from '@/components/marketing/legal';
import { pageMeta } from '@/components/marketing/seo';

export const metadata = pageMeta(
  'الشروط والأحكام',
  'شروط استخدام منصة طاقم للموارد البشرية والرواتب: الخدمة، والحسابات، والفوترة، والبيانات، وحدود المسؤولية، والنظام الواجب التطبيق.',
  '/terms',
);

export default function Page() {
  return (
    <LegalPage
      title={['الشروط والأحكام', 'Terms of service']}
      intro={['الشروط التي تنظم استخدامك لمنصة طاقم وخدماتها.', 'The terms that govern your use of Taqam and its services.']}
      updated={LEGAL_UPDATED}
      sections={TERMS}
    />
  );
}
