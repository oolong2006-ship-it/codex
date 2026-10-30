/**
 * Editorial & Document Renderer — editable DOCX with native RTL (w:bidi / w:rtl),
 * header with document code, footer with page numbers, control block and revision history.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { DocContent } from "./writer";
import { STATUS_AR, controlRows, type RenderMeta } from "./labels";

export type { RenderMeta };

const FONT = "Arial";

const run = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, rightToLeft: true, font: { name: FONT, hint: "cs" }, bold: opts.bold, boldComplexScript: opts.bold, size: opts.size ?? 22, sizeComplexScript: opts.size ?? 22, color: opts.color });

const para = (text: string, opts: { bold?: boolean; size?: number; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; color?: string } = {}) =>
  new Paragraph({
    bidirectional: true,
    alignment: opts.align ?? AlignmentType.START,
    heading: opts.heading,
    spacing: { after: 120 },
    children: [run(text, opts)],
  });

const cell = (text: string, header = false) =>
  new TableCell({
    children: [para(text || " ", { bold: header, size: 20 })],
    shading: header ? { type: ShadingType.CLEAR, fill: "E8EEF5", color: "auto" } : undefined,
  });

function table(headers: string[], rows: string[][]) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "9AA5B1" };
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h) => cell(h, true)) }),
      ...rows.map((r) => new TableRow({ children: headers.map((_, i) => cell(r[i] ?? "")) })),
    ],
  });
}

export async function renderDocx(content: DocContent, meta: RenderMeta): Promise<Buffer> {
  const control = table(["البند", "القيمة"], controlRows(meta));

  const body = content.sections.flatMap((s) => [
    para(s.heading, { heading: HeadingLevel.HEADING_2, bold: true, size: 26, color: "1F3A5F" }),
    ...s.paragraphs.map((p) => para(p)),
    ...(s.table ? [table(s.table.headers, s.table.rows), para(" ")] : []),
  ]);

  const history = table(
    ["الإصدار", "الحالة", "ملخص التغيير", "التاريخ"],
    meta.history.map((h) => [String(h.versionNo), STATUS_AR[h.status] ?? h.status, h.summary, h.date]),
  );

  const watermark = meta.status === "EFFECTIVE" ? [] : [para(`نسخة ${STATUS_AR[meta.status] ?? meta.status} — غير سارية`, { bold: true, color: "B42318", align: AlignmentType.CENTER })];

  const doc = new Document({
    creator: "Global ISO AI Platform",
    title: `${meta.code} ${meta.title}`,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1200, bottom: 1200, left: 1100, right: 1100 } } },
        headers: {
          default: new Header({
            children: [para(`${meta.orgName} | ${meta.code} | ${meta.title} | إصدار ${meta.versionNo}`, { size: 18, color: "52606D" })],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                bidirectional: true,
                alignment: AlignmentType.CENTER,
                children: [
                  run("صفحة ", { size: 18 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
                  run(" من ", { size: 18 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 }),
                  run(" — النسخة المطبوعة غير مضبوطة؛ الإصدار الساري في المنصة هو المرجع.", { size: 16, color: "7B8794" }),
                ],
              }),
            ],
          }),
        },
        children: [
          para(meta.orgName, { size: 24, color: "52606D" }),
          para(meta.title, { heading: HeadingLevel.TITLE, bold: true, size: 36, color: "1F3A5F" }),
          ...watermark,
          control,
          para(" "),
          ...body,
          para("سجل الإصدارات", { heading: HeadingLevel.HEADING_2, bold: true, size: 26, color: "1F3A5F" }),
          history,
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
