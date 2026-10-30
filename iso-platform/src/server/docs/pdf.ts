/**
 * PDF renderer — HTML (escaped) → Chromium (playwright-core). Arabic font is embedded from the
 * bundled OFL package so output is identical across environments. Long-running PDF work belongs
 * in the worker or a route handler, never in a serverless edge function.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { STATUS_AR, controlRows, type RenderMeta } from "./labels";
import type { DocContent } from "./writer";

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let fontCss: string | null = null;
function fonts(): string {
  if (fontCss) return fontCss;
  const req = createRequire(join(process.cwd(), "package.json"));
  const dir = join(dirname(req.resolve("@fontsource/ibm-plex-sans-arabic/package.json")), "files");
  const face = (subset: string, weight: number, range: string) => {
    const b64 = readFileSync(join(dir, `ibm-plex-sans-arabic-${subset}-${weight}-normal.woff2`)).toString("base64");
    return `@font-face{font-family:"Plex Arabic";font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${range};}`;
  };
  const AR = "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC";
  const LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
  fontCss = [face("arabic", 400, AR), face("arabic", 700, AR), face("latin", 400, LAT), face("latin", 700, LAT)].join("\n");
  return fontCss;
}

const highlight = (t: string) =>
  esc(t).replace(/\[MISSING:[^\]]*\]/g, (m) => `<mark>${m}</mark>`);

function table(headers: string[], rows: string[][]) {
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${headers.map((_, i) => `<td>${highlight(r[i] ?? "")}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export function renderHtml(content: DocContent, meta: RenderMeta): string {
  const body = content.sections
    .map((s) => `<section><h2>${esc(s.heading)}</h2>${s.paragraphs.map((p) => `<p>${highlight(p)}</p>`).join("")}${s.table ? table(s.table.headers, s.table.rows) : ""}</section>`)
    .join("");
  const notEffective = meta.status !== "EFFECTIVE" ? `<p class="stamp">نسخة ${esc(STATUS_AR[meta.status] ?? meta.status)} — غير سارية</p>` : "";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(meta.code)}</title><style>
${fonts()}
@page{size:A4;margin:22mm 18mm 20mm 18mm}
*{box-sizing:border-box}
body{font-family:"Plex Arabic","DejaVu Sans",sans-serif;font-size:11pt;line-height:1.75;color:#1f2933;margin:0}
.org{color:#52606d;font-size:10pt;margin:0}
h1{color:#1f3a5f;font-size:20pt;margin:2pt 0 6pt}
h2{color:#1f3a5f;font-size:13pt;margin:14pt 0 4pt;break-after:avoid}
p{margin:0 0 6pt;orphans:2;widows:2}
table{width:100%;border-collapse:collapse;margin:4pt 0 10pt;font-size:9.5pt;break-inside:auto}
th,td{border:0.6pt solid #9aa5b1;padding:3pt 5pt;text-align:start;vertical-align:top;overflow-wrap:break-word;word-break:normal}
th{background:#e8eef5}
tr{break-inside:avoid}
thead{display:table-header-group}
mark{background:#fde2e1;color:#9b1c1c;padding:0 2pt}
.stamp{color:#b42318;font-weight:700;text-align:center;border:1pt solid #b42318;padding:3pt;margin:6pt 0}
.ltr{direction:ltr;unicode-bidi:embed}
</style></head><body>
<p class="org">${esc(meta.orgName)}</p>
<h1>${esc(meta.title)}</h1>
${notEffective}
${table(["البند", "القيمة"], controlRows(meta))}
${body}
<section><h2>سجل الإصدارات</h2>${table(["الإصدار", "الحالة", "ملخص التغيير", "التاريخ"], meta.history.map((h) => [String(h.versionNo), STATUS_AR[h.status] ?? h.status, h.summary, h.date]))}</section>
</body></html>`;
}

const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
/** CHROMIUM_PATH, else a known local install, else the browser installed by `playwright-core install chromium`. */
function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined;
}

let browserPromise: Promise<Browser> | null = null;
function browser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] })
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

export async function closePdfBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close();
  }
}

export async function renderPdf(content: DocContent, meta: RenderMeta): Promise<Buffer> {
  const b = await browser();
  const ctx = await b.newContext({ javaScriptEnabled: false }); // content is data, never script
  try {
    const page = await ctx.newPage();
    await page.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort())); // no network
    await page.setContent(renderHtml(content, meta), { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready").catch(() => {});
    const tpl = (inner: string) =>
      `<div style="font-family:'DejaVu Sans',sans-serif;font-size:7.5pt;color:#52606d;width:100%;padding:0 18mm;direction:rtl;text-align:center">${inner}</div>`;
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: tpl(`${esc(meta.orgName)} | <span dir="ltr">${esc(meta.code)}</span> | ${esc(meta.title)} | إصدار ${meta.versionNo}`),
      footerTemplate: tpl(`صفحة <span class="pageNumber"></span> من <span class="totalPages"></span> — النسخة المطبوعة غير مضبوطة؛ الإصدار الساري في المنصة هو المرجع.`),
      margin: { top: "22mm", bottom: "20mm", left: "18mm", right: "18mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await ctx.close();
  }
}
