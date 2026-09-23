"use client";
import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import type { Supplier } from "@/lib/types";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ أزرار
type Variant = "default" | "primary" | "brand" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  default: "bg-surface text-ink border border-line hover:bg-bg",
  primary: "bg-accent text-[#1b1305] border border-transparent hover:brightness-95",
  brand: "bg-brand text-brand-ink border border-transparent hover:brightness-110",
  ghost: "bg-transparent border border-line text-ink hover:bg-surface",
  danger: "bg-surface text-danger border border-line hover:bg-bg",
};

export const buttonClass = (variant: Variant = "default", extra?: string) => cn(
  "inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[15px] font-semibold",
  "cursor-pointer transition disabled:cursor-not-allowed disabled:opacity-50 no-underline",
  VARIANTS[variant], extra,
);

export const Button = forwardRef<HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }>(
  function Button({ variant = "default", loading, className, children, disabled, type = "button", ...rest }, ref) {
    return (
      <button ref={ref} type={type} disabled={disabled || loading}
        className={buttonClass(variant, className)} {...rest}>
        {loading && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {children}
      </button>
    );
  });

// ------------------------------------------------------------------ حقول
export function Field({ label, error, hint, required, children, className }: {
  label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm text-muted", className)}>
      <span>{label}{required && <span className="mr-1 text-danger">*</span>}</span>
      {children}
      {hint && !error && <span className="text-xs">{hint}</span>}
      {error && <span className="text-xs font-medium text-danger" role="alert">{error}</span>}
    </label>
  );
}

export function Fieldset({ legend, required, error, children }: {
  legend: string; required?: boolean; error?: string; children: ReactNode;
}) {
  return (
    <fieldset className="mb-4 rounded-xl border border-line p-3">
      <legend className="px-1.5 font-semibold text-brand">
        {legend}{required && <span className="mr-1 text-danger">*</span>}
      </legend>
      {children}
      {error && <p className="mt-2 text-xs font-medium text-danger" role="alert">{error}</p>}
    </fieldset>
  );
}

export function CheckGroup({ name, options, value, onChange, label }: {
  name: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void; label?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {label && <span className="w-full text-[13px] text-muted">{label}</span>}
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <label key={o} className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm",
            on ? "border-brand bg-ok-soft text-ink" : "border-line bg-bg")}>
            <input type="checkbox" name={name} value={o} checked={on} className="accent-[var(--brand)]"
              onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />
            {o}
          </label>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ شارات
export function StatusBadge({ status }: { status: Supplier["status"] }) {
  const ok = status === "موثّق";
  return <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold",
    ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>{status}</span>;
}

export function DemoBadge({ demo }: { demo: boolean }) {
  return demo ? <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-warn">تجريبي</span> : null;
}

export function Stars({ n }: { n: number }) {
  if (!n) return <span className="text-[13px] text-muted">بدون تقييم</span>;
  return <span className="tracking-[1px] text-accent" aria-label={`${n} من 5`}>{"★".repeat(n)}{"☆".repeat(5 - n)}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-md border border-line bg-bg px-2 py-0.5 text-xs">{children}</span>;
}

// ------------------------------------------------------------------ تنبيهات
export function Notice({ tone = "warn", children }: { tone?: "warn" | "ok" | "danger"; children: ReactNode }) {
  const tones = { warn: "bg-warn-soft text-warn", ok: "bg-ok-soft text-ok", danger: "bg-warn-soft text-danger" };
  return <div className={cn("mb-3 rounded-[10px] px-3.5 py-2.5 text-sm", tones[tone])}>{children}</div>;
}

export function Spinner({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </div>
  );
}

// ------------------------------------------------------------------ نافذة حوار
export function Dialog({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose}
      className={cn("max-h-[92vh] w-[min(760px,96vw)] rounded-2xl bg-surface p-0 text-ink backdrop:bg-[rgba(10,20,15,.55)]",
        wide && "w-[min(1000px,96vw)]")}>
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3.5">
        <h2 className="m-0 text-xl font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="text-[26px] leading-none text-muted">×</button>
      </div>
      <div className="p-4">{children}</div>
      {footer && <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-line bg-surface px-4 py-3">{footer}</div>}
    </dialog>
  );
}
