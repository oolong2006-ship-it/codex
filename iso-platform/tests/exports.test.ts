import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { approveVersion, listDocuments, loadRenderable, makeEffective, saveDraft, submitForReview, contentToText, textToContent, getDocument } from "@/server/domain/documents";
import { buildDeliveryPackage, csvCell } from "@/server/docs/package";
import { closePdfBrowser, renderHtml, renderPdf } from "@/server/docs/pdf";
import type { TenantCtx } from "@/server/domain/tenant";
import { newOrg, seedProjectWithDocuments } from "./helpers";

let S: Awaited<ReturnType<typeof seedProjectWithDocuments>>;
const dir = mkdtempSync(join(tmpdir(), "iso-exports-"));

beforeAll(async () => {
  S = await seedProjectWithDocuments("factory");
  // Make the policy effective so the package mixes effective and draft documents.
  const pol = (await listDocuments(S.ctx, S.projectId)).find((d) => d.doc_type === "POLICY")!;
  const { versions } = await getDocument(S.ctx, pol.id);
  await saveDraft(S.ctx, pol.latest_version_id, textToContent(contentToText(versions[0].content).replace(/\[MISSING:[^\]]*\]/g, "الجودة أولاً")), "استكمال");
  await submitForReview(S.ctx, pol.latest_version_id);
  await approveVersion(S.qm, pol.latest_version_id);
  await makeEffective(S.qm, pol.latest_version_id);
}, 120000);

afterAll(async () => {
  await closePdfBrowser();
  await closePools();
});

describe("PDF export", () => {
  it("renders an A4 PDF with embedded Arabic font, code and page numbering", async () => {
    const pol = (await listDocuments(S.ctx, S.projectId)).find((d) => d.doc_type === "POLICY")!;
    const r = await loadRenderable(S.ctx, pol.latest_version_id);
    const pdf = await renderPdf(r.content, r.meta);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const f = join(dir, "pol.pdf");
    writeFileSync(f, pdf);
    const fonts = execFileSync("pdffonts", [f]).toString();
    expect(fonts).toMatch(/IBMPlexSansArabic/);
    expect(fonts).not.toMatch(/\bno\s+no\b/); // all fonts embedded
    const text = execFileSync("pdftotext", ["-layout", f, "-"]).toString();
    expect(text).toContain("QM-POL-001");
    expect(text).toMatch(/1\s*\S*\s*1/); // "صفحة 1 من 1" (bidi order varies in extraction)
    expect(execFileSync("pdfinfo", [f]).toString()).toMatch(/A4/);
  });

  it("escapes document content — markup in client text cannot become HTML", () => {
    const html = renderHtml(
      { sections: [{ heading: "<script>alert(1)</script>", paragraphs: ['<img src=x onerror="alert(1)">'] }] },
      { orgName: "<b>x</b>", code: "C", title: "T", versionNo: 1, status: "DRAFT", classification: "OPTIONAL", author: "a", approver: null, approvedAt: null, effectiveAt: null, history: [] },
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("ZIP delivery package", () => {
  let zip: JSZip;
  let counts: { documents: number; effective: number; missingItems: number };

  beforeAll(async () => {
    const pkg = await buildDeliveryPackage(S.ctx, S.projectId, { includePdf: true, now: new Date("2026-10-16T10:00:00Z") });
    zip = await JSZip.loadAsync(pkg.buffer);
    counts = pkg.counts;
    expect(pkg.fileName).toBe("ISO9001-package-2026-10-16.zip");
  }, 180000);

  it("contains every document as DOCX and PDF plus the control files", () => {
    const names = Object.keys(zip.files);
    const docx = names.filter((n) => n.includes("/documents/") && n.endsWith(".docx"));
    const pdf = names.filter((n) => n.includes("/documents/") && n.endsWith(".pdf"));
    expect(docx.length).toBe(counts.documents);
    expect(pdf.length).toBe(counts.documents);
    for (const f of ["00_Master_Document_List.csv", "00_Master_Document_List.docx", "00_Missing_Items_Register.csv", "00_Missing_Items_Register.docx", "00_Implementation_Plan.docx", "00_Implementation_Plan.pdf", "README.txt"]) {
      expect(names.some((n) => n.endsWith(f)), f).toBe(true);
    }
    expect(names.some((n) => n.endsWith("01_Scope_Policy_Objectives/QM-POL-001-v1.docx"))).toBe(true);
  });

  it("master list reflects real states (1 effective, rest not)", async () => {
    const csvText = await zip.file(/00_Master_Document_List\.csv$/)[0].async("string");
    expect(csvText.charCodeAt(0)).toBe(0xfeff); // BOM so Excel reads Arabic
    const lines = csvText.trim().split("\r\n");
    expect(lines.length).toBe(counts.documents + 1);
    expect(counts.effective).toBe(1);
    expect(lines.find((l) => l.startsWith('"QM-POL-001"'))).toContain("سارية");
  });

  it("missing-items register lists placeholders, licensing and unverified classifications — not invented values", async () => {
    const reg = await zip.file(/00_Missing_Items_Register\.csv$/)[0].async("string");
    expect(reg).toContain("[MISSING:");
    expect(reg).toContain("ترخيص");
    expect(reg).toContain("تصنيف إلزام غير متحقق");
    expect(reg).toContain("وثيقة غير سارية");
    expect(counts.missingItems).toBeGreaterThan(10);
  });

  it("implementation plan leaves dates to the client and disclaims certification", async () => {
    const plan = await zip.file(/00_Implementation_Plan\.docx$/)[0].async("nodebuffer");
    const xml = await (await JSZip.loadAsync(plan)).file("word/document.xml")!.async("string");
    expect(xml).toContain("الموعد يحدده العميل");
    expect(xml).toContain("المنصة لا تمنح الشهادة");
    expect(xml).not.toMatch(/20\d\d-\d\d-\d\d<\/w:t>.*الموعد/); // no invented target dates
  });

  it("is tenant-isolated", async () => {
    const other = await newOrg("SOFTWARE");
    await expect(buildDeliveryPackage(other.ctx as TenantCtx, S.projectId, { includePdf: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("CSV safety", () => {
  it("neutralises spreadsheet formula injection", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("عادي")).toBe(`"عادي"`);
  });
});
