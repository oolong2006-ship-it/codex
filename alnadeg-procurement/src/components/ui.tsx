"use client";
import { forwardRef, type ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- الأزرار
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "gold";

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant; loading?: boolean; full?: boolean;
  }
>(function Button(
  { variant = "primary", loading, full, className, children, disabled, ...rest }, ref,
) {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500",
    secondary: "bg-white text-brand-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:ring-brand-500",
    danger: "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 focus:ring-slate-400",
    gold: "bg-gold-500 text-white hover:bg-gold-600 focus:ring-gold-400",
  };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold",
        "transition focus:outline-none focus:ring-2 focus:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-60",
        full && "w-full", variants[variant], className,
      )}
      {...rest}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------- الحقول
export function Field({
  label, error, hint, required, children,
}: {
  label: string; error?: string; hint?: string; required?: boolean; children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="mr-1 text-rose-600">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

const fieldBase =
  "block w-full rounded-lg border-0 px-3 py-2.5 text-sm text-slate-900 shadow-sm " +
  "ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 " +
  "focus:ring-2 focus:ring-inset focus:ring-brand-600 disabled:bg-slate-50 disabled:text-slate-500";

export const Input = forwardRef<
  HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...rest }, ref) {
  return (
    <input ref={ref}
      className={cn(fieldBase, invalid && "ring-rose-400 focus:ring-rose-500", className)}
      {...rest} />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...rest }, ref) {
  return (
    <textarea ref={ref} rows={3}
      className={cn(fieldBase, invalid && "ring-rose-400 focus:ring-rose-500", className)}
      {...rest} />
  );
});

export const Select = forwardRef<
  HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <select ref={ref}
      className={cn(fieldBase, "pl-8", invalid && "ring-rose-400 focus:ring-rose-500", className)}
      {...rest}>
      {children}
    </select>
  );
});

// ---------------------------------------------------------------- البطاقات
export function Card({
  title, action, children, className,
}: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl bg-white p-5 shadow-card ring-1 ring-slate-200", className)}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-bold text-brand-800">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label, value, tone = "brand", hint,
}: { label: string; value: string | number; tone?: string; hint?: string }) {
  const tones: Record<string, string> = {
    brand: "text-brand-700 bg-brand-50 ring-brand-100",
    gold: "text-gold-700 bg-gold-50 ring-gold-100",
    rose: "text-rose-700 bg-rose-50 ring-rose-100",
    amber: "text-amber-800 bg-amber-50 ring-amber-100",
    slate: "text-slate-700 bg-slate-100 ring-slate-200",
  };
  return (
    <div className="rounded-xl bg-white p-4 shadow-card ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn("mt-2 inline-block rounded-lg px-2.5 py-1 text-2xl font-extrabold ring-1",
        tones[tone] ?? tones.brand)}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- التنبيهات
export function Alert({
  tone = "info", title, children,
}: { tone?: "info" | "success" | "error" | "warning"; title?: string; children?: ReactNode }) {
  const tones = {
    info: "bg-sky-50 text-sky-900 ring-sky-200",
    success: "bg-brand-50 text-brand-900 ring-brand-200",
    error: "bg-rose-50 text-rose-900 ring-rose-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-200",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-lg px-4 py-3 text-sm ring-1", tones[tone])}>
      {title && <p className="mb-0.5 font-bold">{title}</p>}
      {children}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
      className ?? "bg-slate-100 text-slate-700 ring-slate-200",
    )}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- الجداول
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col"
      className={cn("whitespace-nowrap px-3 py-3 text-right text-xs font-bold text-slate-600", className)}>
      {children}
    </th>
  );
}

export function Td({
  children, className, dir,
}: { children?: ReactNode; className?: string; dir?: "rtl" | "ltr" }) {
  return (
    <td dir={dir} className={cn("px-3 py-3 text-slate-700", className)}>{children}</td>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Spinner({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      {label}
    </div>
  );
}

// ---------------------------------------------------------------- النوافذ
export function Modal({
  open, title, onClose, children, wide,
}: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn(
        "max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl",
        wide ? "sm:max-w-3xl" : "sm:max-w-lg",
      )}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-brand-800">{title}</h3>
          <button onClick={onClose} aria-label="إغلاق"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- الترقيم
export function Pagination({
  page, pageSize, total, onChange,
}: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-slate-500">
        عرض {from}–{to} من {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1}
          onClick={() => onChange(page - 1)} className="px-3 py-1.5">
          السابق
        </Button>
        <span className="px-2 text-slate-600">صفحة {page} من {pages}</span>
        <Button variant="secondary" disabled={page >= pages}
          onClick={() => onChange(page + 1)} className="px-3 py-1.5">
          التالي
        </Button>
      </div>
    </div>
  );
}
