"use client";
import { COLUMNS, exportCell } from "./columns";
import type { Supplier, SupplierInput } from "./types";

// SheetJS يُحمَّل عند الحاجة فقط حتى لا يثقل الصفحة الرئيسية
const loadXlsx = () => import("xlsx");

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function exportSuppliersXlsx(rows: (Supplier | Partial<SupplierInput>)[], filename: string) {
  const XLSX = await loadXlsx();
  const aoa = [COLUMNS.map(([, label]) => label), ...rows.map((s) => COLUMNS.map(([k]) => exportCell(s, k)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = COLUMNS.map(([k]) => ({ wch: ["name", "legal_name", "products", "notes", "categories", "coverage"].includes(k) ? 28 : 14 }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "الموردون");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  download(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

/** قالب الاستيراد: صف مثال واحد يوضح الصيغة */
export function downloadTemplate() {
  return exportSuppliersXlsx([{
    name: "مثال: مؤسسة الأمثلة التجارية (احذف هذا الصف)", city: "الرياض", cr: "1010XXXXXX",
    categories: ["لحوم ودواجن", "مجمدات"], coverage: ["الرياض", "القصيم"], delivery_days: ["الأحد", "الخميس"],
    payment: "آجل", credit_days: 30, certificates: ["HACCP"], status: "قيد التحقق", source: "فريق المشتريات",
  }], "قالب-استيراد-الموردين.xlsx");
}

/** يقرأ أول ورقة من ملف Excel/CSV كصفوف كائنات */
export async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = /\.csv$/i.test(file.name)
    ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string" })
    : XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
}
