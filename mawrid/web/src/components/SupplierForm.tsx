"use client";
import { useState } from "react";
import { CATEGORIES, CERTIFICATES, CITIES, DAYS, PAYMENT_TERMS, SOURCES, STATUSES } from "@/lib/constants";
import type { SupplierInput } from "@/lib/types";
import { validateSupplier, type SupplierFormErrors } from "@/lib/validation";
import { Button, CheckGroup, Field, Fieldset, Notice, cn } from "./ui";

/** قيم النموذج كنصوص كما يكتبها المستخدم؛ التحويل والتحقق عند الحفظ */
type FormValues = Record<keyof SupplierInput, string | string[]>;

const EMPTY: FormValues = {
  name: "", legal_name: "", cr: "", vat: "", city: "الرياض", district: "", national_address: "",
  contact_name: "", contact_role: "", phone: "", whatsapp: "", email: "", website: "",
  categories: [], products: "", coverage: [], delivery_days: [], lead_time: "", moq: "",
  payment: "نقدي", credit_days: "", certificates: [], sfda_license: "", status: "قيد التحقق",
  rating: "0", notes: "", source: "فريق المشتريات",
};

export function toFormValues(s: Partial<SupplierInput>): FormValues {
  const out = { ...EMPTY };
  for (const k of Object.keys(EMPTY) as (keyof SupplierInput)[]) {
    const v = s[k];
    if (v === null || v === undefined) continue;
    out[k] = Array.isArray(v) ? v : String(v);
  }
  return out;
}

export function SupplierForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: Partial<SupplierInput>;
  submitLabel: string;
  onSubmit: (data: SupplierInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<FormValues>(() => toFormValues(initial ?? {}));
  const [errors, setErrors] = useState<SupplierFormErrors>({});
  const [saving, setSaving] = useState(false);

  const set = (k: keyof SupplierInput) => (val: string | string[]) => {
    setV((cur) => ({ ...cur, [k]: val }));
    if (errors[k]) setErrors((cur) => ({ ...cur, [k]: undefined }));
  };
  const text = (k: keyof SupplierInput, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className={cn("field", errors[k] && "field-invalid")} value={v[k] as string}
      aria-invalid={!!errors[k]} onChange={(e) => set(k)(e.target.value)} {...props} />
  );
  const select = (k: keyof SupplierInput, options: readonly (string | [string, string])[]) => (
    <select className="field" value={v[k] as string} onChange={(e) => set(k)(e.target.value)}>
      {options.map((o) => {
        const [val, label] = Array.isArray(o) ? o : [o, o];
        return <option key={val} value={val}>{label}</option>;
      })}
    </select>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = validateSupplier({ ...v, credit_days: v.credit_days || 0 });
    if (!r.ok) {
      setErrors(r.errors);
      requestAnimationFrame(() => document.querySelector("[aria-invalid=true], [role=alert]")
        ?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    setSaving(true);
    try { await onSubmit(r.data); } finally { setSaving(false); }
  };

  const errCount = Object.values(errors).filter(Boolean).length;
  const sourceOptions = SOURCES.includes(v.source as never) || !v.source
    ? SOURCES : [v.source as string, ...SOURCES];

  return (
    <form onSubmit={submit} noValidate>
      {errCount > 0 && <Notice tone="danger">يرجى تصحيح {errCount === 1 ? "حقل واحد" : `${errCount} حقول`} قبل الحفظ.</Notice>}

      <Fieldset legend="البيانات الأساسية">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الاسم التجاري" required error={errors.name}>{text("name")}</Field>
          <Field label="الاسم النظامي (حسب السجل)" error={errors.legal_name}>{text("legal_name")}</Field>
          <Field label="رقم السجل التجاري" error={errors.cr} hint="10 أرقام">{text("cr", { inputMode: "numeric", dir: "ltr" })}</Field>
          <Field label="الرقم الضريبي" error={errors.vat} hint="15 رقماً">{text("vat", { inputMode: "numeric", dir: "ltr" })}</Field>
          <Field label="المدينة الرئيسية" required error={errors.city}>{select("city", CITIES)}</Field>
          <Field label="الحي" error={errors.district}>{text("district")}</Field>
          <Field label="العنوان الوطني" className="sm:col-span-2" error={errors.national_address}>
            {text("national_address", { placeholder: "مثال: RRRD2929", dir: "ltr" })}
          </Field>
        </div>
      </Fieldset>

      <Fieldset legend="التواصل">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="مسؤول المبيعات" error={errors.contact_name}>{text("contact_name")}</Field>
          <Field label="المسمى" error={errors.contact_role}>{text("contact_role")}</Field>
          <Field label="الجوال" error={errors.phone}>{text("phone", { type: "tel", placeholder: "05XXXXXXXX" })}</Field>
          <Field label="واتساب" error={errors.whatsapp}>{text("whatsapp", { type: "tel", placeholder: "9665XXXXXXXX" })}</Field>
          <Field label="البريد" error={errors.email}>{text("email", { type: "email" })}</Field>
          <Field label="الموقع الإلكتروني" error={errors.website}>{text("website", { type: "url", placeholder: "example.com" })}</Field>
        </div>
      </Fieldset>

      <Fieldset legend="التصنيفات" required error={errors.categories}>
        <CheckGroup name="categories" label="التصنيفات" options={CATEGORIES} value={v.categories as string[]} onChange={set("categories")} />
      </Fieldset>

      <Field label="أهم المنتجات والعلامات (افصل بفاصلة)" className="mb-4" error={errors.products}>
        <textarea className="field min-h-[70px]" value={v.products as string} onChange={(e) => set("products")(e.target.value)} />
      </Field>

      <Fieldset legend="التغطية والتوريد">
        <div className="space-y-3">
          <CheckGroup name="coverage" label="مدن التغطية" options={CITIES} value={v.coverage as string[]} onChange={set("coverage")} />
          <CheckGroup name="delivery_days" label="أيام التوريد" options={DAYS} value={v.delivery_days as string[]} onChange={set("delivery_days")} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="مدة التوريد" error={errors.lead_time}>{text("lead_time", { placeholder: "مثال: 24 ساعة" })}</Field>
            <Field label="الحد الأدنى للطلب" error={errors.moq}>{text("moq", { placeholder: "مثال: 1,500 ريال" })}</Field>
          </div>
        </div>
      </Fieldset>

      <Fieldset legend="الشروط التجارية">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="شروط الدفع" error={errors.payment}>{select("payment", PAYMENT_TERMS)}</Field>
          <Field label="مدة الآجل (يوم)" error={errors.credit_days}>
            {text("credit_days", { type: "number", min: 0, max: 365, step: 15, inputMode: "numeric" })}
          </Field>
        </div>
      </Fieldset>

      <Fieldset legend="الجودة والتوثيق">
        <div className="space-y-3">
          <CheckGroup name="certificates" label="الشهادات" options={CERTIFICATES} value={v.certificates as string[]} onChange={set("certificates")} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="رقم ترخيص الغذاء والدواء" error={errors.sfda_license}>{text("sfda_license", { dir: "ltr" })}</Field>
            <Field label="حالة التوثيق" error={errors.status}
              hint="«موثّق» فقط بعد التحقق من السجل والمستندات">{select("status", STATUSES)}</Field>
            <Field label="تقييمنا للمورد" error={errors.rating}>
              {select("rating", [["0", "بدون تقييم"], ["5", "5 ممتاز"], ["4", "4 جيد جداً"], ["3", "3 جيد"], ["2", "2 ضعيف"], ["1", "1 سيئ"]])}
            </Field>
            <Field label="مصدر البيانات" required error={errors.source}>{select("source", sourceOptions)}</Field>
          </div>
        </div>
      </Fieldset>

      <Field label="ملاحظات المشتريات" error={errors.notes}>
        <textarea className="field min-h-[70px]" value={v.notes as string} onChange={(e) => set("notes")(e.target.value)} />
      </Field>

      <div className="sticky bottom-0 -mx-4 mt-5 flex flex-wrap gap-2 border-t border-line bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
        <Button type="submit" variant="primary" loading={saving}>{submitLabel}</Button>
        <Button onClick={onCancel} disabled={saving}>إلغاء</Button>
      </div>
    </form>
  );
}
