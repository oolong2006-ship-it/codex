import Link from "next/link";

const PRODUCTS = [
  { t: "التشخيص والاكتشاف", d: "ملف المنشأة، مقابلة استشارية تتكيف مع نشاطك، كشف التعارضات والحقائق الناقصة، وتقييم أولي للفجوات." },
  { t: "التصميم والبناء", d: "نطاق النظام، خريطة العمليات، المخاطر والفرص، خطة الوثائق، ثم وثائق مخصصة قابلة للتحرير والتصدير بصيغة Word." },
  { t: "التطبيق والتشغيل", d: "إدارة الوثائق المضبوطة بالإصدارات والاعتمادات، والسجلات الرقمية — وحدات التشغيل تُضاف تباعاً." },
  { t: "التدقيق والتحسين", d: "تدقيق داخلي وإجراءات تصحيحية وتحقق من الفاعلية، وتحضير للتدقيق الخارجي دون ادعاء منح شهادة." },
  { t: "سوق الخدمات الاستشارية", d: "باقات متدرجة ومراجعة بشرية اختيارية من خبراء مخولين فعلياً، وتوسع متعدد المواقع." },
];

const SECTORS = ["المطاعم والمطابخ المركزية", "التصنيع", "المقاولات", "التقنية والبرمجيات", "التعليم والتدريب", "الخدمات المهنية", "أنشطة أخرى (حزمة عامة)"];

export default function Landing() {
  return (
    <main>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="text-lg font-bold text-brand-700">منصة أيزو الاستشارية</span>
          <nav className="flex gap-2">
            <Link className="btn-ghost" href="/login">تسجيل الدخول</Link>
            <Link className="btn-primary" href="/register">ابدأ التشخيص المجاني</Link>
          </nav>
        </div>
      </header>

      <section className="bg-gradient-to-b from-brand-700 to-brand-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs">ISO 9001:2026 — الإصدار المنشور في سبتمبر 2026</p>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight text-white md:text-4xl">
            نظام إدارة جودة مصمم لنشاطك الفعلي — من التشخيص حتى التشغيل والتحسين
          </h1>
          <p className="mt-4 max-w-2xl text-brand-100">
            منصة استشارية رقمية تفهم منشأتك، وتصمم نظامها، وتنتج وثائق مضبوطة قابلة للتحرير، وتساعدك على تطبيقه وإثباته — بالعربية أولاً.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn bg-white text-brand-700 hover:bg-brand-50" href="/register">أنشئ حساب منشأتك</Link>
            <a className="btn border border-white/40 text-white hover:bg-white/10" href="#how">كيف تعمل المنصة</a>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="mb-6 text-2xl">خمسة منتجات مترابطة على نموذج بيانات واحد</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PRODUCTS.map((p) => (
            <div key={p.t} className="card">
              <h3 className="mb-2 font-semibold text-brand-700">{p.t}</h3>
              <p className="text-sm text-slate-600">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="mb-4 text-2xl">تخصيص حسب القطاع</h2>
          <p className="mb-6 max-w-3xl text-sm text-slate-600">
            إجابات منشأتين من قطاعين مختلفين تنتج خريطتي عمليات وحزمتي وثائق مختلفتين فعلاً — لا قالباً ثابتاً بتغيير الاسم والشعار.
          </p>
          <div className="flex flex-wrap gap-2">
            {SECTORS.map((s) => (
              <span key={s} className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-sm text-brand-700">{s}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="mb-4 text-2xl">الشفافية أولاً</h2>
        <ul className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          <li className="card">نفرّق بوضوح بين: نظام موثق، ونظام مطبق، ونظام جرى تدقيقه، ومنشأة حصلت على شهادة من جهة مانحة معتمدة. المنصة لا تمنح شهادات ISO.</li>
          <li className="card">كل معلومة تحمل مصدرها وحالتها (من العميل، مستنتجة، متحقق منها، ناقصة، متعارضة). لا نختلق توقيعاً أو تاريخاً أو سجلاً لم يحدث.</li>
          <li className="card">نصوص مواصفات ISO محمية بحقوق النشر؛ لا ندّعي تغطية كاملة للمتطلبات إلا بمرجع مرخّص ومراجعة خبير.</li>
          <li className="card">الأسعار تُحدد حسب النطاق وعدد المواقع وتظهر في عرض السعر قبل أي التزام.</li>
        </ul>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} منصة أيزو الاستشارية — ISO علامة مسجلة للمنظمة الدولية للتقييس، ولا ارتباط رسمي بين المنصة والمنظمة.
      </footer>
    </main>
  );
}
