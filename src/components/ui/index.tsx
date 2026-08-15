import * as React from "react";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";

// ── Button ────────────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-muted text-foreground hover:bg-muted/70",
  outline: "border border-border bg-card hover:bg-muted",
  ghost: "hover:bg-muted text-foreground",
  danger: "bg-[hsl(var(--danger))] text-white hover:opacity-90",
  success: "bg-[hsl(var(--success))] text-white hover:opacity-90",
};
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6 text-sm",
  icon: "h-9 w-9",
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>(({ className, variant = "primary", size = "md", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
      BTN_VARIANT[variant],
      BTN_SIZE[size],
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";

// ── Card ──────────────────────────────────────────────────────
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold leading-none", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

// ── Badge ─────────────────────────────────────────────────────
const TONE: Record<BadgeTone, string> = {
  success: "bg-[hsl(var(--success))]/12 text-[hsl(var(--success))] ring-[hsl(var(--success))]/25",
  warning: "bg-[hsl(var(--warning))]/12 text-[hsl(var(--warning))] ring-[hsl(var(--warning))]/25",
  danger: "bg-[hsl(var(--danger))]/12 text-[hsl(var(--danger))] ring-[hsl(var(--danger))]/25",
  info: "bg-primary/10 text-primary ring-primary/25",
  neutral: "bg-muted text-muted-foreground ring-border",
};
export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}

// ── Input / Label / Textarea / Select ─────────────────────────
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-foreground", className)} {...props} />;
}

// ── Progress ──────────────────────────────────────────────────
export function Progress({ value, className }: { value: number; className?: string }) {
  const tone = value >= 80 ? "success" : value >= 50 ? "warning" : "danger";
  const color =
    tone === "success" ? "hsl(var(--success))" : tone === "warning" ? "hsl(var(--warning))" : "hsl(var(--danger))";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }} />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────
export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 py-12 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
