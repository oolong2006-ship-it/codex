import { PricingPage } from '@/components/marketing/PricingPage';
import { pageMeta } from '@/components/marketing/seo';

export const metadata = pageMeta(
  'الأسعار — باقات واضحة لكل موظف',
  'أسعار طاقم بالريال السعودي لكل موظف شهرياً: أساسي 19 ر.س، نمو 29 ر.س، ومؤسسات بتسعير مخصص. وفّر 15% مع الاشتراك السنوي وجرّب مجاناً 14 يوماً.',
  '/pricing',
);

export default function Page() {
  return <PricingPage />;
}
