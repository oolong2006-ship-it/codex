/**
 * Best-effort text extraction from an uploaded buffer without heavy native
 * dependencies. Plain text and CSV pass through; PDFs are scanned for readable
 * text runs. For production, swap in a dedicated PDF/OCR pipeline — the callers
 * only depend on the returned string.
 */
export function extractText(buffer: Buffer, mimeType: string, fileName: string): string {
  const name = fileName.toLowerCase();

  if (mimeType.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".csv")) {
    return buffer.toString("utf8");
  }

  if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }

  // Office / unknown: pull any printable ASCII/UTF-8 runs.
  return extractPrintableRuns(buffer.toString("latin1"));
}

/** Extract text between BT…ET and (…) / <…> operators in a PDF content stream. */
function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];

  // Text shown with Tj / TJ operators is wrapped in parentheses.
  const paren = raw.match(/\(((?:\\.|[^\\()])*)\)/g) ?? [];
  for (const p of paren) {
    const inner = p
      .slice(1, -1)
      .replace(/\\([nrt])/g, " ")
      .replace(/\\([()\\])/g, "$1");
    if (inner.trim().length > 1) chunks.push(inner);
  }

  const text = chunks.join(" ").replace(/\s+/g, " ").trim();
  return text.length > 20 ? text : extractPrintableRuns(raw);
}

function extractPrintableRuns(s: string): string {
  const runs = s.match(/[\x20-\x7E؀-ۿ]{4,}/g) ?? [];
  return runs.join("\n").slice(0, 60_000);
}
