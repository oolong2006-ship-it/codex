import type { ComponentProps, ReactNode } from "react";

/** Small set of shared building blocks; logical CSS properties keep RTL and LTR correct. */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ children, className, ...rest }: ComponentProps<"section">) {
  return (
    <section
      {...rest}
      className={cx("rounded-2xl border border-line bg-card p-5 shadow-sm", className)}
    >
      {children}
    </section>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 font-semibold transition disabled:opacity-50",
        variant === "primary" && "bg-palm text-white hover:bg-palm/90",
        variant === "secondary" && "border border-line bg-white hover:bg-sand",
        variant === "danger" && "border border-red-200 bg-white text-red-700 hover:bg-red-50",
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="text-sm opacity-70">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 focus:outline-2 focus:outline-palm";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <span
      className={cx(
        "inline-block rounded-full px-2.5 py-0.5 text-sm",
        tone === "neutral" && "bg-sand",
        tone === "good" && "bg-palm/10 text-palm",
        tone === "warn" && "bg-amber-100 text-amber-800",
      )}
    >
      {children}
    </span>
  );
}
