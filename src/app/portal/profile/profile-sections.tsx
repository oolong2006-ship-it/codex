"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { useLang } from "@/lib/i18n/context";
import { SUPPLIER_TYPES, SAUDI_CITIES, SAUDI_REGIONS, PAYMENT_TERMS } from "@/lib/constants";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Textarea, Badge } from "@/components/ui";
import {
  updateCompanyAction, addContactAction, deleteContactAction, setCategoriesAction,
  addProductAction, deleteProductAction, addServiceAction, deleteServiceAction,
  addBrandAction, deleteBrandAction, addLocationAction, deleteLocationAction, saveCommercialTermsAction,
} from "../actions";

type Cat = { id: string; nameEn: string; nameAr: string; level: number; parentId: string | null };

export function ProfileSections(props: {
  supplier: Record<string, unknown>;
  contacts: { id: string; name: string; jobTitle: string | null; email: string | null; mobile: string | null }[];
  products: { id: string; nameEn: string; brand: string | null; sku: string | null; source: string }[];
  selectedCategoryIds: string[];
  categories: Cat[];
  services: { id: string; name: string; category: string | null; sla: string | null }[];
  brands: { id: string; name: string; country: string | null; relationship: string }[];
  locations: { id: string; country: string; region: string | null; city: string | null }[];
  terms: Record<string, unknown> | null;
}) {
  const s = props.supplier;
  const { lang } = useLang();
  const name = (k: string) => (lang === "ar" ? "nameAr" : "nameEn") as keyof Cat & string;

  return (
    <div className="space-y-6">
      {/* Company */}
      <Section title="Company information">
        <FormAction action={updateCompanyAction}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldI name="companyNameEn" label="Company Name (EN)" defaultValue={s.companyNameEn} required />
            <FieldI name="companyNameAr" label="اسم الشركة (AR)" defaultValue={s.companyNameAr} dir="rtl" required />
            <FieldI name="crNumber" label="Commercial Registration" defaultValue={s.crNumber} />
            <FieldI name="vatNumber" label="VAT Number" defaultValue={s.vatNumber} />
            <FieldI name="iban" label="IBAN" defaultValue={s.iban} />
            <FieldI name="companyType" label="Company Type" defaultValue={s.companyType} />
            <FieldI name="yearEstablished" label="Year Established" type="number" defaultValue={s.yearEstablished} />
            <div>
              <Label>City</Label>
              <Select name="city" defaultValue={(s.city as string) ?? ""}>
                <option value="">—</option>
                {SAUDI_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <FieldI name="headquarters" label="Headquarters" defaultValue={s.headquarters} />
            <FieldI name="website" label="Website" defaultValue={s.website} />
            <FieldI name="employeeCount" label="Employees" defaultValue={s.employeeCount} />
            <FieldI name="annualRevenue" label="Annual Revenue (optional)" defaultValue={s.annualRevenue} />
            <FieldI name="primaryPhone" label="Primary Phone" defaultValue={s.primaryPhone} />
            <input type="hidden" name="country" value={(s.country as string) ?? "Saudi Arabia"} />
          </div>
          <div className="mt-4">
            <Label>Supplier types</Label>
            <div className="flex flex-wrap gap-3">
              {SUPPLIER_TYPES.map((st) => (
                <label key={st.value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="supplierTypes" value={st.value} defaultChecked={(s.supplierTypes as string[])?.includes(st.value)} />
                  {lang === "ar" ? st.ar : st.en}
                </label>
              ))}
            </div>
          </div>
          <SaveBar />
        </FormAction>
      </Section>

      {/* Categories */}
      <Section title="Categories">
        <CategoryPicker categories={props.categories} selected={props.selectedCategoryIds} labelKey={name("")} />
      </Section>

      {/* Contacts */}
      <Section title="Contacts">
        <ItemList
          items={props.contacts.map((c) => ({ id: c.id, primary: c.name, secondary: [c.jobTitle, c.email, c.mobile].filter(Boolean).join(" · ") }))}
          onDelete={deleteContactAction}
        />
        <FormAction action={addContactAction} reset>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FieldI name="name" label="Name" required />
            <FieldI name="jobTitle" label="Job Title" />
            <FieldI name="mobile" label="Mobile" />
            <FieldI name="whatsapp" label="WhatsApp" />
            <FieldI name="email" label="Email" type="email" />
          </div>
          <AddBar label="Add contact" />
        </FormAction>
      </Section>

      {/* Products */}
      <Section title="Products">
        <ItemList
          items={props.products.map((p) => ({ id: p.id, primary: p.nameEn, secondary: [p.brand, p.sku].filter(Boolean).join(" · "), badge: p.source === "AI" ? "AI" : undefined }))}
          onDelete={deleteProductAction}
        />
        <FormAction action={addProductAction} reset>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FieldI name="nameEn" label="Product Name (EN)" required />
            <FieldI name="nameAr" label="Product Name (AR)" dir="rtl" />
            <FieldI name="sku" label="SKU" />
            <FieldI name="brand" label="Brand" />
            <FieldI name="model" label="Model" />
            <FieldI name="countryOfOrigin" label="Country of Origin" />
            <FieldI name="unitOfMeasure" label="Unit of Measure" />
            <FieldI name="minOrderQty" label="Min Order Qty" type="number" />
            <FieldI name="leadTime" label="Lead Time" />
            <FieldI name="warranty" label="Warranty" />
            <div className="sm:col-span-2">
              <Label>Category</Label>
              <Select name="categoryId" defaultValue="">
                <option value="">—</option>
                {props.categories.filter((c) => c.level >= 1).map((c) => <option key={c.id} value={c.id}>{lang === "ar" ? c.nameAr : c.nameEn}</option>)}
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Description</Label><Textarea name="description" /></div>
            <div className="sm:col-span-2"><Label>Specifications</Label><Textarea name="specifications" /></div>
          </div>
          <AddBar label="Add product" />
        </FormAction>
      </Section>

      {/* Services */}
      <Section title="Services">
        <ItemList
          items={props.services.map((sv) => ({ id: sv.id, primary: sv.name, secondary: [sv.category, sv.sla].filter(Boolean).join(" · ") }))}
          onDelete={deleteServiceAction}
        />
        <FormAction action={addServiceAction} reset>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FieldI name="name" label="Service Name" required />
            <FieldI name="category" label="Category" />
            <FieldI name="sla" label="SLA" />
            <FieldI name="experienceYears" label="Experience (years)" type="number" />
            <div className="sm:col-span-2">
              <Label>Cities covered</Label>
              <div className="flex flex-wrap gap-3">
                {SAUDI_CITIES.slice(0, 10).map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="citiesCovered" value={c} />{c}</label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2"><Label>Description</Label><Textarea name="description" /></div>
          </div>
          <AddBar label="Add service" />
        </FormAction>
      </Section>

      {/* Brands */}
      <Section title="Brands">
        <ItemList
          items={props.brands.map((b) => ({ id: b.id, primary: b.name, secondary: [b.country, b.relationship].filter(Boolean).join(" · ") }))}
          onDelete={deleteBrandAction}
        />
        <FormAction action={addBrandAction} reset>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <FieldI name="name" label="Brand Name" required />
            <FieldI name="country" label="Country" />
            <div>
              <Label>Relationship</Label>
              <Select name="relationship" defaultValue="DISTRIBUTOR">
                <option value="MANUFACTURER">Manufacturer</option>
                <option value="AGENT">Agent</option>
                <option value="DISTRIBUTOR">Distributor</option>
                <option value="RESELLER">Reseller</option>
              </Select>
            </div>
          </div>
          <AddBar label="Add brand" />
        </FormAction>
      </Section>

      {/* Locations */}
      <Section title="Geographical coverage">
        <ItemList
          items={props.locations.map((l) => ({ id: l.id, primary: [l.city, l.region].filter(Boolean).join(", ") || l.country, secondary: l.country }))}
          onDelete={deleteLocationAction}
        />
        <FormAction action={addLocationAction} reset>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <FieldI name="country" label="Country" defaultValue="Saudi Arabia" required />
            <div>
              <Label>Region</Label>
              <Select name="region" defaultValue=""><option value="">—</option>{SAUDI_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}</Select>
            </div>
            <div>
              <Label>City</Label>
              <Select name="city" defaultValue=""><option value="">—</option>{SAUDI_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
            </div>
          </div>
          <AddBar label="Add location" />
        </FormAction>
      </Section>

      {/* Commercial terms */}
      <Section title="Commercial terms">
        <FormAction action={saveCommercialTermsAction}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Payment Terms</Label>
              <Select name="paymentTerms" defaultValue={(props.terms?.paymentTerms as string) ?? ""}>
                <option value="">—</option>
                {PAYMENT_TERMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <FieldI name="creditDays" label="Credit Days" type="number" defaultValue={props.terms?.creditDays} />
            <FieldI name="minimumOrder" label="Minimum Order" defaultValue={props.terms?.minimumOrder} />
            <FieldI name="deliveryLeadTime" label="Delivery Lead Time" defaultValue={props.terms?.deliveryLeadTime} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              ["deliveryCapability", "Delivery capability"],
              ["warehouseAvailable", "Warehouse available"],
              ["fleetAvailable", "Fleet available"],
              ["importCapability", "Import capability"],
            ].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={k} defaultChecked={Boolean(props.terms?.[k])} /> {label}
              </label>
            ))}
          </div>
          <SaveBar />
        </FormAction>
      </Section>
    </div>
  );
}

// ── Reusable pieces ───────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FieldI({ name, label, defaultValue, type = "text", required, dir }: {
  name: string; label: string; defaultValue?: unknown; type?: string; required?: boolean; dir?: string;
}) {
  return (
    <div>
      <Label>{label}{required && <span className="text-[hsl(var(--danger))]"> *</span>}</Label>
      <Input name={name} type={type} dir={dir} required={required} defaultValue={(defaultValue as string | number | undefined) ?? ""} />
    </div>
  );
}

function FormAction({ action, children, reset }: { action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>; children: React.ReactNode; reset?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const formEl = e.currentTarget;
        start(async () => {
          const res = await action(fd);
          if (res.ok) { setOk(true); setError(null); if (reset) formEl.reset(); router.refresh(); setTimeout(() => setOk(false), 1500); }
          else setError(res.error ?? "Failed");
        });
      }}
    >
      {children}
      <div className="mt-2 flex items-center gap-3">
        <PendingFlag pending={pending} ok={ok} />
        {error && <span className="text-sm text-[hsl(var(--danger))]">{error}</span>}
      </div>
    </form>
  );
}

function PendingFlag({ pending, ok }: { pending: boolean; ok: boolean }) {
  if (pending) return <span className="text-sm text-muted-foreground">Saving…</span>;
  if (ok) return <span className="text-sm text-[hsl(var(--success))]">Saved ✓</span>;
  return null;
}

function SaveBar() {
  return <div className="mt-4"><Button type="submit">Save</Button></div>;
}
function AddBar({ label }: { label: string }) {
  return <div className="mt-3"><Button type="submit" size="sm" variant="outline"><Plus className="h-4 w-4" /> {label}</Button></div>;
}

function ItemList({ items, onDelete }: { items: { id: string; primary: string; secondary?: string; badge?: string }[]; onDelete: (id: string) => Promise<{ ok: boolean }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing added yet.</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {items.map((it) => (
        <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="truncate">{it.primary}</span>
              {it.badge && <Badge tone="info">{it.badge}</Badge>}
            </div>
            {it.secondary && <div className="truncate text-xs text-muted-foreground">{it.secondary}</div>}
          </div>
          <button
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-[hsl(var(--danger))]"
            disabled={pending}
            onClick={() => start(async () => { await onDelete(it.id); router.refresh(); })}
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function CategoryPicker({ categories, selected }: { categories: Cat[]; selected: string[]; labelKey?: string }) {
  const { lang } = useLang();
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(selected);
  const [pending, start] = useTransition();

  const roots = categories.filter((c) => c.level === 0);
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id);

  const toggle = (id: string) => setChosen((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const label = (c: Cat) => (lang === "ar" ? c.nameAr : c.nameEn);

  return (
    <div className="space-y-3">
      {roots.map((root) => (
        <div key={root.id}>
          <Chip active={chosen.includes(root.id)} onClick={() => toggle(root.id)}>{label(root)}</Chip>
          <div className="ms-4 mt-2 flex flex-wrap gap-2">
            {childrenOf(root.id).map((sub) => (
              <Chip key={sub.id} small active={chosen.includes(sub.id)} onClick={() => toggle(sub.id)}>{label(sub)}</Chip>
            ))}
          </div>
        </div>
      ))}
      <Button size="sm" disabled={pending} onClick={() => start(async () => { await setCategoriesAction(chosen); router.refresh(); })}>
        {pending ? "Saving…" : "Save categories"}
      </Button>
    </div>
  );
}

function Chip({ active, onClick, children, small }: { active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border transition-colors ${small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
