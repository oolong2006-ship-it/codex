import { redirect } from "next/navigation";
import { setActiveOrg } from "@/server/domain/auth";
import { createOrganization, listMyOrganizations } from "@/server/domain/orgs";
import { PACKS } from "@/server/packs";
import { back, errorMessage, requireUser, str } from "@/server/web";
import { Field, Flash, flash, type SP } from "@/components/ui";

async function createOrgAction(fd: FormData) {
  "use server";
  const s = await requireUser();
  try {
    const orgId = await createOrganization(s.userId, {
      name: str(fd, "name"),
      legalName: str(fd, "legalName"),
      country: str(fd, "country") || "SA",
      industryCode: str(fd, "industryCode"),
      sizeBand: str(fd, "sizeBand") as "SMALL",
      description: str(fd, "description"),
      headOfficeCity: str(fd, "city"),
    });
    await setActiveOrg(s.sessionId, s.userId, orgId);
  } catch (e) {
    back("/onboarding", "err", errorMessage(e));
  }
  redirect("/app");
}

async function switchOrgAction(fd: FormData) {
  "use server";
  const s = await requireUser();
  await setActiveOrg(s.sessionId, s.userId, str(fd, "orgId"));
  redirect("/app");
}

export default async function Onboarding({ searchParams }: { searchParams: SP }) {
  const s = await requireUser();
  const orgs = await listMyOrganizations(s.userId);
  const f = await flash(searchParams);
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1">مرحباً {s.fullName}</h1>
      <p className="mb-6 text-sm text-slate-600">أنشئ ملف منشأتك لبدء التشخيص، أو اختر منشأة أنت عضو فيها.</p>
      <Flash {...f} />
      {orgs.length > 0 && (
        <div className="card mb-6">
          <h2 className="mb-3">منشآتك</h2>
          <ul className="space-y-2">
            {orgs.map((o) => (
              <li key={o.id} className="flex items-center justify-between">
                <span>{o.name}</span>
                <form action={switchOrgAction}>
                  <input type="hidden" name="orgId" value={o.id} />
                  <button className="btn-ghost">فتح</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form action={createOrgAction} className="card space-y-4">
        <h2>منشأة جديدة</h2>
        <Field label="اسم المنشأة" name="name" required />
        <Field label="الاسم القانوني (كما في السجل التجاري)" name="legalName" />
        <label className="block">
          <span className="label">النشاط الرئيسي <span className="text-red-600">*</span></span>
          <select name="industryCode" className="input" required defaultValue="">
            <option value="" disabled>اختر النشاط</option>
            {Object.values(PACKS).map((p) => (
              <option key={p.code} value={p.code}>{p.ar}</option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">يحدد النشاط أسئلة المقابلة والعمليات والمخاطر النموذجية.</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">الحجم</span>
            <select name="sizeBand" className="input" defaultValue="SMALL">
              <option value="MICRO">متناهية الصغر (1–5)</option>
              <option value="SMALL">صغيرة (6–49)</option>
              <option value="MEDIUM">متوسطة (50–249)</option>
              <option value="LARGE">كبيرة (250+)</option>
            </select>
          </label>
          <label className="block">
            <span className="label">الدولة</span>
            <select name="country" className="input" defaultValue="SA">
              <option value="SA">السعودية</option>
              <option value="AE">الإمارات</option>
              <option value="KW">الكويت</option>
              <option value="QA">قطر</option>
              <option value="BH">البحرين</option>
              <option value="OM">عُمان</option>
              <option value="EG">مصر</option>
              <option value="JO">الأردن</option>
            </select>
          </label>
          <Field label="مدينة المقر الرئيسي" name="city" />
        </div>
        <label className="block">
          <span className="label">نبذة عن المنشأة</span>
          <textarea name="description" className="input" rows={3} />
        </label>
        <button className="btn-primary">إنشاء المنشأة</button>
      </form>
      <form action="/logout" method="post" className="mt-6 text-center"><button className="text-sm text-brand-600 underline">تسجيل الخروج</button></form>
    </main>
  );
}
