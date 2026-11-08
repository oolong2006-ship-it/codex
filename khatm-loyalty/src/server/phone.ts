/**
 * Normalises a phone number to E.164, defaulting to Saudi Arabia (+966).
 * Accepts Arabic-Indic digits, spaces, dashes, 05XXXXXXXX, 5XXXXXXXX, 9665…, +9665…, 009665….
 */
export function normalizePhone(input: string): string | null {
  const western = input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  let s = western.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^05\d{8}$/.test(s)) return "+966" + s.slice(1);
  if (/^5\d{8}$/.test(s)) return "+966" + s;
  if (/^9665\d{8}$/.test(s)) return "+" + s;
  if (/^\+9665\d{8}$/.test(s)) return s;
  if (/^\+966/.test(s)) return null; // Saudi prefix but not a valid mobile
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  return null;
}

export function maskPhone(e164: string): string {
  return e164.length > 6 ? e164.slice(0, 4) + "•••••" + e164.slice(-3) : e164;
}
