import { LegalPage } from '@/components/marketing/LegalPage';
import { LEGAL_UPDATED, PRIVACY } from '@/components/marketing/legal';
import { pageMeta } from '@/components/marketing/seo';

export const metadata = pageMeta(
  'سياسة الخصوصية',
  'كيف يجمع شؤون البيانات الشخصية ويستخدمها ويحميها وفق نظام حماية البيانات الشخصية، مع الالتزام باستضافة البيانات داخل المملكة العربية السعودية.',
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
