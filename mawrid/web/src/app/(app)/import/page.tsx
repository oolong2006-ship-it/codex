"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { SOURCES } from "@/lib/constants";
import { existingDedupKeys, upsertSuppliers } from "@/lib/data";
import { planImport, type ImportPlan } from "@/lib/import";
import { downloadTemplate, readSheet } from "@/lib/spreadsheet";
import { dbErrorMessage } from "@/lib/validation";
import { useToast } from "@/components/Toast";
import { Button, Field, Notice, buttonClass } from "@/components/ui";

const BATCH = 100;

export default function ImportPage() {
  const { canEdit } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string>(SOURCES[1]);
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ ok: number; failed: { row: number; name: string; msg: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return <Notice>ليست لديك صلاحية الاستيراد.</Notice>;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setResult(null); setPlan(null); setFileName(file.name);
    if (file.size > 10 * 1024 * 1024) { setError("حجم الملف أكبر من 10 ميجابايت"); return; }
    setReading(true);
    try {
      const [rows, keys] = await Promise.all([readSheet(file), existingDedupKeys()]);
      if (!rows.length) { setError("الملف فارغ أو لا يحتوي صفوفاً تحت العناوين"); return; }
      setExisting(keys);
      setPlan(planImport(rows, source));
    } catch {
      setError("تعذرت قراءة الملف. تأكد أنه Excel (xlsx/xls) أو CSV بترميز UTF-8.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const run = async () => {
    if (!plan?.valid.length) return;
    setRunning(true); setProgress(0);
    let ok = 0;
    const failed: { row: number; name: string; msg: string }[] = [];
    for (let i = 0; i < plan.valid.length; i += BATCH) {
      const batch = plan.valid.slice(i, i + BATCH);
      try {
        await upsertSuppliers(batch.map((b) => b.data));
        ok += batch.length;
      } catch {
        // فشلت الدفعة: نعيدها صفاً صفاً لتحديد الصف المسبب
        for (const b of batch) {
          try { await upsertSuppliers([b.data]); ok++; }
          catch (e) { failed.push({ row: b.row, name: b.data.name, msg: dbErrorMessage(e as Error) }); }
        }
      }
      setProgress(Math.min(i + BATCH, plan.valid.length));
    }
    setResult({ ok, failed });
    setPlan(null);
    setRunning(false);
    toast(`تم استيراد ${ok} مورد`);
  };

  const updates = plan ? plan.valid.filter((v) => existing.has(v.key)).length : 0;

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <h1 className="mb-2 mt-0 text-2xl font-bold">استيراد موردين دفعة واحدة</h1>
      <p className="mt-0">ارفع ملف Excel أو CSV بنفس أعمدة القالب (العناوين بالعربي أو الإنجليزي).
        المورد الذي يتكرر رقم سجله التجاري — أو اسمه ومدينته إن لم يكن له سجل — <b>يُحدَّث ولا يُكرَّر</b>.</p>
      <p className="text-sm text-muted">الأعمدة المتعددة (التصنيفات، التغطية، أيام التوريد، الشهادات) افصل قيمها بـ | أو فاصلة.
        الحقول الإلزامية: الاسم التجاري، المدينة، تصنيف واحد. أي حالة غير «موثّق» صراحةً تُسجَّل «قيد التحقق».</p>

      <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="مصدر البيانات (للصفوف التي لا تحدد مصدرها)" required>
          <select className="field" value={source} onChange={(e) => setSource(e.target.value)} disabled={running}>
            {SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => downloadTemplate().catch(() => toast("تعذر تنزيل القالب"))}>تحميل القالب الفارغ</Button>
        <label className={buttonClass("primary", running || reading ? "pointer-events-none opacity-50" : "")}>
          {reading ? "جارٍ قراءة الملف…" : "اختيار الملف"}
          <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv"
            onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>

      <div className="mt-5" aria-live="polite">
        {error && <Notice tone="danger">{error}</Notice>}

        {plan && (
          <>
            <p className="font-semibold">{fileName}</p>
            <ul className="my-2 space-y-1 ps-5 text-[15px]">
              <li><b>{plan.valid.length}</b> مورد جاهز للاستيراد — {plan.valid.length - updates} جديد، {updates} تحديث لموجود.</li>
              {plan.merged > 0 && <li>{plan.merged} صف مكرر داخل الملف تم دمجه (اعتُمد آخر صف).</li>}
              {plan.blank > 0 && <li className="text-muted">{plan.blank} صف فارغ تم تجاهله.</li>}
              {plan.errors.length > 0 && <li className="text-danger">{plan.errors.length} صف فيه أخطاء لن يُستورد (التفاصيل أدناه).</li>}
            </ul>
            {plan.unknownHeaders.length > 0 && (
              <Notice>أعمدة لم يُتعرّف عليها وستُتجاهل: {plan.unknownHeaders.join("، ")}</Notice>
            )}
            {plan.errors.length > 0 && (
              <details className="mb-3 rounded-[10px] border border-line p-3" open={plan.errors.length <= 10}>
                <summary className="cursor-pointer font-semibold">تقرير الأخطاء</summary>
                <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto text-sm">
                  {plan.errors.slice(0, 200).map((e) => (
                    <li key={e.row}><b>صف {e.row}</b>{e.name && ` (${e.name})`}: {e.messages.join("؛ ")}</li>
                  ))}
                  {plan.errors.length > 200 && <li className="text-muted">… و{plan.errors.length - 200} صف آخر</li>}
                </ul>
              </details>
            )}
            {plan.valid.length > 0 && (
              <Button variant="primary" onClick={run} loading={running}>
                {running ? `جارٍ الاستيراد… ${progress} من ${plan.valid.length}` : `استيراد ${plan.valid.length} مورد`}
              </Button>
            )}
          </>
        )}

        {result && (
          <>
            <Notice tone="ok">تم استيراد <b>{result.ok}</b> مورد.{result.failed.length > 0 && ` تعذر ${result.failed.length}.`}</Notice>
            {result.failed.length > 0 && (
              <ul className="space-y-1 text-sm">
                {result.failed.map((f) => <li key={f.row}><b>صف {f.row}</b> ({f.name}): {f.msg}</li>)}
              </ul>
            )}
            <Link href="/suppliers/" className="mt-3 inline-block text-brand underline">عرض الموردين</Link>
          </>
        )}
      </div>
    </div>
  );
}
