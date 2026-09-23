"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCompare } from "@/lib/compare-context";
import { CATEGORIES, CERTIFICATES, CITIES, MAX_COMPARE, PAGE_SIZE, STATUSES } from "@/lib/constants";
import {
  allMatchingSuppliers, countSuppliers, deleteDemoSuppliers, searchSuppliers, supplierStats,
} from "@/lib/data";
import { fmtNumber } from "@/lib/format";
import { exportSuppliersXlsx } from "@/lib/spreadsheet";
import type { Supplier, SupplierFilters, SupplierStats } from "@/lib/types";
import { dbErrorMessage } from "@/lib/validation";
import { SupplierCard } from "@/components/SupplierCard";
import { useToast } from "@/components/Toast";
import { Button, Notice, Spinner, buttonClass, cn } from "@/components/ui";

const SORTS = ["name", "rating", "updated"] as const;

function filtersFrom(sp: URLSearchParams): SupplierFilters {
  const sort = sp.get("sort");
  return {
    q: sp.get("q") ?? "", category: sp.get("cat") ?? "", city: sp.get("city") ?? "",
    payment: sp.get("pay") ?? "", cert: sp.get("cert") ?? "", status: sp.get("status") ?? "",
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as SupplierFilters["sort"]) : "name",
  };
}

function toQuery(f: SupplierFilters) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("cat", f.category);
  if (f.city) p.set("city", f.city);
  if (f.payment) p.set("pay", f.payment);
  if (f.cert) p.set("cert", f.cert);
  if (f.status) p.set("status", f.status);
  if (f.sort !== "name") p.set("sort", f.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function Directory() {
  const { canEdit, isAdmin } = useAuth();
  const compare = useCompare();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();

  const filters = useMemo(() => filtersFrom(new URLSearchParams(sp.toString())), [sp]);
  const [q, setQ] = useState(filters.q);
  const [rows, setRows] = useState<Supplier[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [stats, setStats] = useState<SupplierStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reqId = useRef(0);

  const setFilters = useCallback((patch: Partial<SupplierFilters>) => {
    router.replace(`/suppliers/${toQuery({ ...filters, ...patch })}`, { scroll: false });
  }, [filters, router]);

  // مزامنة خانة البحث عند الرجوع للخلف أو مسح الفلاتر
  useEffect(() => { setQ(filters.q); }, [filters.q]);

  // البحث النصي بتأخير بسيط أثناء الكتابة
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => setFilters({ q }), 300);
    return () => clearTimeout(t);
  }, [q, filters.q, setFilters]);

  const loadStats = useCallback(() => {
    supplierStats().then(setStats).catch(() => { /* العدادات اختيارية */ });
  }, []);
  useEffect(loadStats, [loadStats]);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    Promise.all([searchSuppliers(filters, 0), countSuppliers(filters)])
      .then(([r, n]) => { if (id === reqId.current) { setRows(r); setTotal(n); } })
      .catch((e) => { if (id === reqId.current) setError(dbErrorMessage(e)); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [filters, reloadKey]);

  const loadMore = async () => {
    setMore(true);
    try {
      const next = await searchSuppliers(filters, rows.length);
      setRows((cur) => [...cur, ...next.filter((n) => !cur.some((c) => c.id === n.id))]);
    } catch (e) {
      toast(dbErrorMessage(e as Error));
    } finally {
      setMore(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const all = await allMatchingSuppliers(filters);
      await exportSuppliersXlsx(all, `موردين-الهوريكا-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast("تعذر التصدير، حاول مرة أخرى");
    } finally {
      setExporting(false);
    }
  };

  const removeDemo = async () => {
    if (!stats?.demo || !confirm(`حذف ${stats.demo} مورد تجريبي نهائياً؟`)) return;
    try {
      const n = await deleteDemoSuppliers();
      toast(`تم حذف ${n} مورد تجريبي`);
      loadStats();
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast(dbErrorMessage(e as Error));
    }
  };

  const hasFilters = Boolean(filters.q || filters.category || filters.city || filters.payment || filters.cert || filters.status);

  return (
    <>
      <div className="-mt-4 mb-2 bg-brand pb-4 pt-1 shadow-[0_0_0_100vmax_var(--brand)] [clip-path:inset(0_-100vmax)]">
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث"
            placeholder="ابحث باسم المورد، منتج، مدينة، سجل تجاري…"
            className="min-w-0 flex-1 basis-[280px] rounded-xl border-0 bg-surface px-4 py-3 text-[17px] text-ink" />
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={doExport} loading={exporting}
              className="border-white/35 text-brand-ink hover:bg-white/10">تصدير Excel</Button>
            {canEdit && (
              <>
                <Link href="/import/" className={buttonClass("ghost", "border-white/35 text-brand-ink hover:bg-white/10")}>استيراد</Link>
                <Link href="/suppliers/new/" className={buttonClass("primary")}>إضافة مورد</Link>
              </>
            )}
          </div>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1.5 pt-3.5" aria-label="التصنيفات">
        {[["", "الكل", stats?.total], ...CATEGORIES.map((c) => [c, c, stats?.categories[c] ?? 0])].map(([val, label, n]) => (
          <button key={String(val)} type="button" aria-pressed={filters.category === val}
            onClick={() => setFilters({ category: String(val) })}
            className={cn("shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm",
              filters.category === val ? "border-ink bg-ink text-bg" : "border-line bg-surface")}>
            {label}{n !== undefined && <span className="ms-1.5 text-xs opacity-60">{n}</span>}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2 pb-3.5 pt-2 text-sm">
        {([
          ["city", "كل المدن", CITIES.map((c) => [c, c])],
          ["payment", "كل شروط الدفع", [["آجل", "يقبل الآجل"], ["نقدي", "نقدي فقط"]]],
          ["cert", "كل الشهادات", CERTIFICATES.map((c) => [c, c])],
          ["status", "كل الحالات", STATUSES.map((c) => [c, c])],
        ] as const).map(([key, all, opts]) => (
          <select key={key} aria-label={all} value={filters[key]}
            onChange={(e) => setFilters({ [key]: e.target.value })}
            className="flex-1 basis-[45%] rounded-[10px] border border-line bg-surface px-2.5 py-2 sm:flex-none sm:basis-auto">
            <option value="">{all}</option>
            {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        <select aria-label="الترتيب" value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as SupplierFilters["sort"] })}
          className="flex-1 basis-[45%] rounded-[10px] border border-line bg-surface px-2.5 py-2 sm:flex-none sm:basis-auto">
          <option value="name">ترتيب: الاسم</option>
          <option value="rating">ترتيب: التقييم</option>
          <option value="updated">ترتيب: آخر تحديث</option>
        </select>
        {hasFilters && (
          <button type="button" className="text-brand underline-offset-4 hover:underline"
            onClick={() => { setQ(""); router.replace("/suppliers/", { scroll: false }); }}>مسح الفلاتر</button>
        )}
        <span className="w-full text-muted sm:ms-auto sm:w-auto" aria-live="polite">
          {total !== null && `${fmtNumber(total)} مورد`}
        </span>
      </div>

      {isAdmin && !!stats?.demo && (
        <Notice>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>يوجد {stats.demo} مورد تجريبي للعرض فقط.</span>
            <Button onClick={removeDemo}>حذف البيانات التجريبية</Button>
          </div>
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      {loading ? <Spinner label="جارٍ تحميل الموردين…" /> : (
        <section className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3" aria-live="polite">
          {rows.length ? rows.map((s) => (
            <SupplierCard key={s.id} s={s} compared={compare.has(s.id)}
              onCompare={() => { if (!compare.toggle(s.id)) toast(`يمكن مقارنة ${MAX_COMPARE} موردين كحد أقصى`); }} />
          )) : (
            <div className="col-span-full px-4 py-12 text-center text-muted">
              {hasFilters ? "لا يوجد مورد يطابق البحث. جرّب تصنيفاً أو مدينة أخرى."
                : canEdit ? "لا يوجد موردون بعد. ابدأ بإضافة أول مورد أو استيراد ملف." : "لا يوجد موردون بعد."}
            </div>
          )}
        </section>
      )}

      {!loading && total !== null && rows.length < total && (
        <div className="mt-5 text-center">
          <Button onClick={loadMore} loading={more}>
            عرض المزيد ({fmtNumber(total - rows.length)} متبقٍ)
          </Button>
        </div>
      )}

      <CompareTray />
    </>
  );
}

function CompareTray() {
  const compare = useCompare();
  if (!compare.ids.length) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 bg-ink px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3 text-bg">
      <span>{compare.ids.length} من {MAX_COMPARE} للمقارنة</span>
      <div className="flex gap-2">
        <button type="button" onClick={compare.clear}
          className="rounded-[10px] border border-white/30 px-4 py-2 font-semibold">إلغاء</button>
        {compare.ids.length >= 2 ? (
          <Link href={`/compare/?ids=${compare.ids.join(",")}`}
            className="rounded-[10px] bg-accent px-4 py-2 font-semibold text-[#1b1305]">قارن الآن</Link>
        ) : (
          <span className="rounded-[10px] bg-accent px-4 py-2 font-semibold text-[#1b1305] opacity-50">قارن الآن</span>
        )}
      </div>
    </div>
  );
}

export default function SuppliersPage() {
  return <Suspense fallback={<Spinner />}><Directory /></Suspense>;
}
