import type { ReactNode } from "react";

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div
      role={err ? "alert" : "status"}
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${err ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
    >
      {err ?? ok}
    </div>
  );
}

const TONES = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  teal: "bg-teal-50 text-teal-700",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export const STATUS: Record<string, { ar: string; tone: keyof typeof TONES }> = {
  DRAFT: { ar: "مسودة", tone: "gray" },
  IN_REVIEW: { ar: "قيد المراجعة", tone: "amber" },
  APPROVED: { ar: "معتمدة", tone: "blue" },
  EFFECTIVE: { ar: "سارية", tone: "green" },
  SUPERSEDED: { ar: "ملغاة بإصدار أحدث", tone: "gray" },
  REJECTED: { ar: "مرفوضة", tone: "red" },
  ARCHIVED: { ar: "مؤرشفة", tone: "gray" },
  INTAKE: { ar: "المقابلة التشخيصية", tone: "amber" },
  BLUEPRINT: { ar: "مراجعة هيكل النظام", tone: "blue" },
  SCOPE_APPROVED: { ar: "النطاق معتمد", tone: "teal" },
  DOCUMENTING: { ar: "التوثيق", tone: "blue" },
  OPERATING: { ar: "التشغيل", tone: "green" },
  VERIFIED: { ar: "متحقق منها", tone: "green" },
  CLIENT_PROVIDED: { ar: "من العميل", tone: "blue" },
  INFERRED: { ar: "مستنتجة", tone: "amber" },
  MISSING: { ar: "ناقصة", tone: "red" },
  CONFLICTED: { ar: "متعارضة", tone: "red" },
  NOT_APPLICABLE: { ar: "غير منطبقة", tone: "gray" },
  REQUIRED_VERIFIED: { ar: "مطلوبة (متحقق منها)", tone: "green" },
  REQUIRED_UNVERIFIED: { ar: "مطلوبة — بانتظار مرجع مرخّص", tone: "amber" },
  SUGGESTED: { ar: "وسيلة مقترحة", tone: "blue" },
  OPTIONAL: { ar: "اختيارية", tone: "gray" },
  HYPOTHESIS: { ar: "فرضية", tone: "amber" },
  QUEUED: { ar: "في الانتظار", tone: "amber" },
  RUNNING: { ar: "قيد التنفيذ", tone: "blue" },
  SUCCEEDED: { ar: "اكتمل", tone: "green" },
  FAILED: { ar: "فشل — ستُعاد المحاولة", tone: "red" },
  DEAD: { ar: "فشل نهائي", tone: "red" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { ar: status, tone: "gray" as const };
  return <Badge tone={s.tone}>{s.ar}</Badge>;
}

export function Field({ label, name, type = "text", required, defaultValue, placeholder, hint, ...rest }: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  hint?: string;
  autoComplete?: string;
  min?: number;
  dir?: "ltr" | "rtl";
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input className="input" name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} {...rest} />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export type SP = Promise<Record<string, string | string[] | undefined>>;
export async function flash(sp: SP) {
  const p = await sp;
  return { ok: typeof p.ok === "string" ? p.ok : undefined, err: typeof p.err === "string" ? p.err : undefined };
}
