import Link from "next/link";
import { getLang } from "@/server/web";
import { t } from "@/lib/i18n";
import { Logo } from "@/components/logo";

export const metadata = { title: "Privacy" };

const AR = [
  ["ما البيانات التي نجمعها؟", "الاسم ورقم الجوال فقط، إضافة إلى سجل الأختام والمكافآت المرتبطة ببطاقتك لدى المتجر."],
  ["لماذا؟", "لتشغيل برنامج الولاء: إضافة الأختام، إظهار تقدمك، ومنحك المكافآت. ورسائل العروض فقط إذا وافقت عليها صراحة."],
  ["من يرى بياناتك؟", "المتجر الذي انضممت لبرنامجه فقط. لا نبيع البيانات ولا نشاركها مع متاجر أخرى."],
  ["أين تُحفظ؟", "على خوادم مخصصة لهذا الغرض، مع إمكانية الاستضافة داخل المملكة العربية السعودية وفق نظام حماية البيانات الشخصية."],
  ["حقوقك", "يمكنك طلب نسخة من بياناتك من المتجر، أو حذفها نهائياً بنفسك من صفحة بطاقتك (زر «حذف بياناتي»)، وإلغاء الاشتراك في العروض في أي وقت."],
];
const EN = [
  ["What we collect", "Your name and mobile number only, plus the stamp and reward history of your card with the business."],
  ["Why", "To run the loyalty program: adding stamps, showing progress and granting rewards. Offers are sent only if you explicitly opt in."],
  ["Who sees it", "Only the business whose program you joined. We never sell or share your data with other businesses."],
  ["Where it's stored", "On servers dedicated to this service, with in-Kingdom hosting available under the Saudi Personal Data Protection Law (PDPL)."],
  ["Your rights", "Ask the business for a copy of your data, delete it yourself from your card page (\"Delete my data\"), and opt out of offers at any time."],
];

export default async function Privacy() {
  const lang = await getLang();
  const items = lang === "ar" ? AR : EN;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/"><Logo label={t(lang, "brand.name")} /></Link>
      <h1 className="mt-8 text-3xl font-bold">{t(lang, "privacy.title")}</h1>
      <div className="mt-6 space-y-5">
        {items.map(([h, b]) => (
          <section key={h} className="card p-5">
            <h2 className="font-semibold">{h}</h2>
            <p className="mt-2 leading-relaxed text-espresso-700">{b}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
