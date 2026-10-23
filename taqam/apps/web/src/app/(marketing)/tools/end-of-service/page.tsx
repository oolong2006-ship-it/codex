import { EosbCalculator } from '@/components/marketing/EosbCalculator';
import { pageMeta } from '@/components/marketing/seo';

export const metadata = pageMeta(
  'حاسبة نهاية الخدمة المجانية — نظام العمل السعودي',
  'احسب مكافأة نهاية الخدمة مجاناً وفق المادتين 84 و85 من نظام العمل السعودي، حسب سبب انتهاء العلاقة ومدة الخدمة، مع بدل رصيد الإجازات وتفصيل كامل.',
  '/tools/end-of-service',
);

export default function Page() {
  return <EosbCalculator />;
}
