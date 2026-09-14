"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/auth-context";
import { fetchLocations, fetchRefValues } from "@/lib/data";
import { purchaseRequestSchema, type PurchaseRequestInput } from "@/lib/validation";
import { todayISO } from "@/lib/format";
import { VAT_RATE } from "@/lib/constants";
import type { LocationRow, PurchaseRequestRow, RefValueRow } from "@/types/database";
import { Alert, Button, Card, Field, Input, Select, Spinner, Textarea } from "./ui";

export function RequestForm({
  initial, onSubmit, submitLabel = "حفظ الطلب", busy,
}: {
  initial?: Partial<PurchaseRequestRow>;
  onSubmit: (values: PurchaseRequestInput) => Promise<void>;
  submitLabel?: string;
  busy?: boolean;
}) {
  const { profile, isSuperAdmin } = useAuth();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [categories, setCategories] = useState<RefValueRow[]>([]);
  const [units, setUnits] = useState<RefValueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    register, handleSubmit, watch, setValue, formState: { errors },
  } = useForm<PurchaseRequestInput>({
    resolver: zodResolver(purchaseRequestSchema),
    defaultValues: {
      location_id: initial?.location_id ?? profile?.location_id ?? "",
      purchase_date: initial?.purchase_date ?? todayISO(),
      purchase_type: (initial?.purchase_type as "operational") ?? "operational",
      priority: (initial?.priority as "normal") ?? "normal",
      supplier_name: initial?.supplier_name ?? "",
      supplier_vat: initial?.supplier_vat ?? "",
      invoice_number: initial?.invoice_number ?? "",
      invoice_date: initial?.invoice_date ?? todayISO(),
      amount_before_vat: initial?.amount_before_vat ?? 0,
      vat_amount: initial?.vat_amount ?? 0,
      total_amount: initial?.total_amount ?? 0,
      category: initial?.category ?? "",
      items_description: initial?.items_description ?? "",
      quantity: initial?.quantity ?? undefined,
      unit: initial?.unit ?? "",
      justification: initial?.justification ?? "",
      notes: initial?.notes ?? "",
    },
  });

  useEffect(() => {
    Promise.all([fetchLocations(), fetchRefValues("category"), fetchRefValues("unit")])
      .then(([l, c, u]) => { setLocations(l); setCategories(c); setUnits(u); })
      .catch((e) => setError(e instanceof Error ? e.message : "تعذر التحميل"))
      .finally(() => setLoading(false));
  }, []);

  // حساب الضريبة والإجمالي تلقائيًا مع إمكانية التعديل اليدوي
  const before = watch("amount_before_vat");
  const vat = watch("vat_amount");
  useEffect(() => {
    const b = Number(before) || 0;
    const v = Number(vat) || 0;
    setValue("total_amount", Number((b + v).toFixed(2)));
  }, [before, vat, setValue]);

  const applyStandardVat = () => {
    const b = Number(watch("amount_before_vat")) || 0;
    setValue("vat_amount", Number((b * VAT_RATE).toFixed(2)));
  };

  if (loading) return <Spinner />;

  // مستخدم الفرع مقيّد بموقعه، ومدير النظام يختار أي موقع
  const selectableLocations = isSuperAdmin
    ? locations
    : locations.filter((l) => l.id === profile?.location_id);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {error && <Alert tone="error">{error}</Alert>}

      <Card title="بيانات الطلب">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الموقع أو الفرع" required error={errors.location_id?.message}>
            <Select {...register("location_id")} invalid={!!errors.location_id}
              disabled={!isSuperAdmin && selectableLocations.length <= 1}>
              <option value="">— اختر الموقع —</option>
              {selectableLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name_ar} {l.kind === "central" ? "(موقع مركزي)" : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="مقدم الطلب">
            <Input value={profile?.full_name ?? ""} disabled />
          </Field>

          <Field label="تاريخ الشراء" required error={errors.purchase_date?.message}>
            <Input {...register("purchase_date")} type="date" invalid={!!errors.purchase_date} />
          </Field>

          <Field label="نوع الشراء" required error={errors.purchase_type?.message}>
            <Select {...register("purchase_type")} invalid={!!errors.purchase_type}>
              <option value="operational">تشغيلي</option>
              <option value="direct">مباشر</option>
              <option value="emergency">طارئ</option>
            </Select>
          </Field>

          <Field label="درجة الأولوية" required error={errors.priority?.message}>
            <Select {...register("priority")} invalid={!!errors.priority}>
              <option value="low">منخفضة</option>
              <option value="normal">عادية</option>
              <option value="high">عالية</option>
              <option value="urgent">عاجلة</option>
            </Select>
          </Field>

          <Field label="فئة المشتريات" required error={errors.category?.message}>
            <Select {...register("category")} invalid={!!errors.category}>
              <option value="">— اختر الفئة —</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>{c.name_ar}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card title="بيانات المورد والفاتورة">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المورد" required error={errors.supplier_name?.message}>
            <Input {...register("supplier_name")} invalid={!!errors.supplier_name} />
          </Field>

          <Field label="الرقم الضريبي للمورد" error={errors.supplier_vat?.message}
            hint="15 رقمًا يبدأ وينتهي بالرقم 3">
            <Input {...register("supplier_vat")} dir="ltr" inputMode="numeric"
              maxLength={15} placeholder="3XXXXXXXXXXXXX3" invalid={!!errors.supplier_vat} />
          </Field>

          <Field label="رقم الفاتورة" required error={errors.invoice_number?.message}>
            <Input {...register("invoice_number")} invalid={!!errors.invoice_number} />
          </Field>

          <Field label="تاريخ الفاتورة" required error={errors.invoice_date?.message}>
            <Input {...register("invoice_date")} type="date" invalid={!!errors.invoice_date} />
          </Field>

          <Field label="قيمة الفاتورة قبل الضريبة" required
            error={errors.amount_before_vat?.message}>
            <Input {...register("amount_before_vat")} type="number" step="0.01" min="0"
              invalid={!!errors.amount_before_vat} />
          </Field>

          <Field label="قيمة الضريبة" required error={errors.vat_amount?.message}>
            <div className="flex gap-2">
              <Input {...register("vat_amount")} type="number" step="0.01" min="0"
                invalid={!!errors.vat_amount} />
              <Button type="button" variant="secondary" onClick={applyStandardVat}
                className="shrink-0 px-3">
                ١٥٪
              </Button>
            </div>
          </Field>

          <Field label="الإجمالي شامل الضريبة" required error={errors.total_amount?.message}
            hint="يُحسب تلقائيًا ويمكن تعديله">
            <Input {...register("total_amount")} type="number" step="0.01" min="0"
              invalid={!!errors.total_amount} />
          </Field>
        </div>
      </Card>

      <Card title="تفاصيل الأصناف والمبرر">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="وصف الأصناف أو الخدمة" required
            error={errors.items_description?.message}>
            <Textarea {...register("items_description")} invalid={!!errors.items_description} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="الكمية" error={errors.quantity?.message}>
              <Input {...register("quantity")} type="number" step="0.001" min="0" />
            </Field>
            <Field label="وحدة القياس">
              <Select {...register("unit")}>
                <option value="">—</option>
                {units.map((u) => (
                  <option key={u.code} value={u.code}>{u.name_ar}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="سبب ومبرر الشراء" required error={errors.justification?.message}>
            <Textarea {...register("justification")} invalid={!!errors.justification} />
          </Field>

          <Field label="ملاحظات">
            <Textarea {...register("notes")} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}
