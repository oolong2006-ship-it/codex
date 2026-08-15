"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/i18n/context";
import { SUPPLIER_TYPES, SAUDI_CITIES } from "@/lib/constants";
import { Button, Card, CardContent, Input, Label, Select } from "@/components/ui";
import { registerSupplierAction, type RegisterResult } from "./actions";

interface Cat { id: string; nameEn: string; nameAr: string }

const STEPS = ["Account", "Company", "Type & Categories", "Contact"] as const;

export function RegisterForm({ categories }: { categories: Cat[] }) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [showDupWarning, setShowDupWarning] = useState<RegisterResult["duplicates"] | null>(null);

  const [form, setForm] = useState({
    email: "",
    password: "",
    mobile: "",
    companyNameEn: "",
    companyNameAr: "",
    crNumber: "",
    vatNumber: "",
    companyType: "",
    yearEstablished: "",
    city: "",
    website: "",
    employeeCount: "",
    supplierTypes: [] as string[],
    categoryIds: [] as string[],
    contactName: "",
    contactJobTitle: "",
    contactEmail: "",
  });

  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const toggleArr = (k: "supplierTypes" | "categoryIds", v: string) =>
    setForm((f) => ({
      ...f,
      [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v],
    }));

  async function submit(force = false) {
    setLoading(true);
    const res = await registerSupplierAction(
      {
        ...form,
        yearEstablished: form.yearEstablished ? Number(form.yearEstablished) : undefined,
      },
      force,
    );
    setLoading(false);
    if (!res.ok && res.duplicates && res.duplicates.length) {
      setShowDupWarning(res.duplicates);
      return;
    }
    setResult(res);
    if (res.ok) {
      // Auto sign-in the new supplier account.
      await signIn("credentials", { email: form.email, password: form.password, redirect: false });
      setTimeout(() => {
        router.push("/portal");
        router.refresh();
      }, 1500);
    }
  }

  if (result?.ok) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-[hsl(var(--success))]" />
          <h2 className="text-xl font-semibold">Registration complete</h2>
          <p className="text-sm text-muted-foreground">
            Your supplier ID is <span className="font-mono font-semibold">{result.supplierCode}</span>.
            Redirecting to your portal…
          </p>
        </CardContent>
      </Card>
    );
  }

  const canNext =
    (step === 0 && form.email && form.password.length >= 8 && form.mobile) ||
    (step === 1 && form.companyNameEn && form.companyNameAr) ||
    step === 2 ||
    (step === 3 && form.contactName);

  return (
    <Card>
      <CardContent className="pt-6">
        <h1 className="text-xl font-semibold">{t("reg.title")}</h1>
        {/* Stepper */}
        <div className="mt-4 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("reg.step")} {step + 1}: {STEPS[step]}
        </p>

        <div className="mt-6 space-y-4">
          {step === 0 && (
            <>
              <Field label="Company Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
              <Field label="Mobile Number"><Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+9665XXXXXXXX" /></Field>
              <Field label="Password"><Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Min 8 characters" /></Field>
            </>
          )}
          {step === 1 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company Name (English)"><Input value={form.companyNameEn} onChange={(e) => set("companyNameEn", e.target.value)} /></Field>
                <Field label="اسم الشركة (عربي)"><Input dir="rtl" value={form.companyNameAr} onChange={(e) => set("companyNameAr", e.target.value)} /></Field>
                <Field label="Commercial Registration No."><Input value={form.crNumber} onChange={(e) => set("crNumber", e.target.value)} /></Field>
                <Field label="VAT Number"><Input value={form.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} /></Field>
                <Field label="Company Type"><Input value={form.companyType} onChange={(e) => set("companyType", e.target.value)} placeholder="LLC, Est., …" /></Field>
                <Field label="Year Established"><Input type="number" value={form.yearEstablished} onChange={(e) => set("yearEstablished", e.target.value)} /></Field>
                <Field label="City">
                  <Select value={form.city} onChange={(e) => set("city", e.target.value)}>
                    <option value="">—</option>
                    {SAUDI_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Website"><Input value={form.website} onChange={(e) => set("website", e.target.value)} /></Field>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div>
                <Label>{t("supplier.type")}</Label>
                <div className="flex flex-wrap gap-2">
                  {SUPPLIER_TYPES.map((st) => (
                    <Chip key={st.value} active={form.supplierTypes.includes(st.value)} onClick={() => toggleArr("supplierTypes", st.value)}>
                      {lang === "ar" ? st.ar : st.en}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <Label>{t("supplier.categories")}</Label>
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No categories configured yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <Chip key={c.id} active={form.categoryIds.includes(c.id)} onClick={() => toggleArr("categoryIds", c.id)}>
                        {lang === "ar" ? c.nameAr : c.nameEn}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <Field label="Contact Name"><Input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Job Title"><Input value={form.contactJobTitle} onChange={(e) => set("contactJobTitle", e.target.value)} /></Field>
                <Field label="Contact Email"><Input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder={form.email} /></Field>
              </div>
            </>
          )}
        </div>

        {result?.error && !showDupWarning && (
          <p className="mt-4 text-sm text-[hsl(var(--danger))]">{result.error}</p>
        )}

        {showDupWarning && (
          <div className="mt-4 rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--warning))]">
              <AlertTriangle className="h-4 w-4" /> Possible duplicate supplier
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {showDupWarning.map((d) => (
                <li key={d.supplierCode}>
                  <span className="font-medium">{d.companyName}</span> ({d.supplierCode}) — {d.score}% · {d.reasons.join(", ")}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowDupWarning(null)}>Review my data</Button>
              <Button size="sm" onClick={() => { setShowDupWarning(null); submit(true); }} disabled={loading}>
                Continue anyway
              </Button>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || loading}>
            {t("common.back")}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>{t("common.next")}</Button>
          ) : (
            <Button onClick={() => submit(false)} disabled={!canNext || loading}>
              {loading ? t("common.saving") : t("reg.complete")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
