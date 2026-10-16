/* Renders a sample DOCX (restaurant golden case, risk register) for visual QA: npx tsx scripts/render-sample.ts <out.docx|out.pdf> [DOC_TYPE] */
import { writeFileSync } from "node:fs";
import { buildBlueprint } from "../src/server/domain/blueprint-engine";
import { renderDocx } from "../src/server/docs/docx";
import { closePdfBrowser, renderPdf } from "../src/server/docs/pdf";
import { writeDocument } from "../src/server/docs/writer";
import { GOLDEN } from "../tests/golden";

(async () => {
  const bp = buildBlueprint({ industry: "FOOD_SERVICE", answers: GOLDEN.restaurantChain.answers, orgName: "مطاعم النخبة", siteNames: ["المقر الرئيسي", "فرع العليا"], licenseActive: false });
  const item = bp.documentPlan.find((d) => d.type === (process.argv[3] ?? "RISK_REGISTER"))!;
  const content = writeDocument(item, { orgName: "مطاعم النخبة", products: "الوجبات السريعة", bp });
  const meta = {
    orgName: "مطاعم النخبة", code: item.code, title: item.title, versionNo: 1, status: "DRAFT", classification: item.classification,
    author: "سارة المالكة", approver: null, approvedAt: null, effectiveAt: null,
    history: [{ versionNo: 1, status: "DRAFT", summary: "إصدار أولي", date: "2026-10-16" }],
  };
  const out = process.argv[2];
  writeFileSync(out, out.endsWith(".pdf") ? await renderPdf(content, meta) : await renderDocx(content, meta));
  await closePdfBrowser();
})();
