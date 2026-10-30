import { LegalPage } from '@/components/marketing/LegalPage';
import { LEGAL_UPDATED, PRIVACY } from '@/components/marketing/legal';
import { pageMeta } from '@/components/marketing/seo';

export const metadata = pageMeta(
  'سياسة الخصوصية',
  'كيف يجمع شؤون البيانات الشخصية ويستخدمها ويحميها بما يراعي نظام حماية البيانات الشخصية، وأين نستضيف البيانات.',
  '/privacy',
);

export default function Page() {
  return (
    <LegalPage
      title={['سياسة الخصوصية', 'Privacy policy']}
      intro={['خصوصية بياناتك وبيانات موظفيك أولوية. نوضح هنا ما نجمعه ولماذا وكيف نحميه.', 'Your and your employees’ privacy is a priority. Here is what we collect, why, and how we protect it.']}
      updated={LEGAL_UPDATED}
      sections={PRIVACY}
    />
  );
}
