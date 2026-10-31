/** Saudization page copy: the Qiwa documentation rule and the «تنبيه نطاقات» reasons (spec §1). Pure, no I/O. */
import type { NitaqatBand } from './types';

export type Bilingual = { ar: string; en: string };

/** Why the official rate can be lower than the internal one. */
export const QIWA_RULE: Bilingual = {
  ar: 'منذ 15 أبريل 2026 لا يُحتسب في نطاقات إلا السعوديون الموثقة عقودهم في منصة قوى، لذلك قد تكون نسبتك الرسمية أقل من نسبتك الداخلية.',
  en: 'Since 15 April 2026 only Saudis whose contracts are documented in Qiwa count toward Nitaqat, so your official rate can be lower than your internal rate.',
};

/** Shown wherever the official rate/band appears: our figure is an estimate, Qiwa decides the band. */
export const OFFICIAL_ESTIMATE: Bilingual = { ar: 'تقديري — النطاق الرسمي يحدده قوى', en: 'Estimate — Qiwa sets the official band' };

/** Arabic counted-noun forms: 1 (with «واحد»), 2 (dual), 3–10 (plural), 11+ (singular accusative). */
export interface ArForms { one: string; two: string; few: string; many: string }
export const SAUDI: ArForms = { one: 'سعودي واحد', two: 'سعوديان', few: 'سعوديين', many: 'سعودياً' };
export const DOCUMENTED_SAUDI: ArForms = { one: 'سعودي موثق واحد', two: 'سعوديان موثقان', few: 'سعوديين موثقين', many: 'سعودياً موثقاً' };

export function arCount(n: number, f: ArForms): string {
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  if (n >= 3 && n <= 10) return `${n} ${f.few}`;
  if (n > 10) return `${n} ${f.many}`;
  return `${n} ${f.few}`;
}

const enSaudis = (n: number) => `${n} Saudi${n === 1 ? '' : 's'}`;

/** «X سعوديين غير موثقة عقودهم في قوى» with the right number agreement. */
export function undocumentedTitle(n: number): Bilingual {
  const ar = n === 1 ? `${SAUDI.one} عقده غير موثق في قوى` : n === 2 ? `${SAUDI.two} عقداهما غير موثقين في قوى` : `${arCount(n, SAUDI)} غير موثقة عقودهم في قوى`;
  return { ar, en: `${enSaudis(n)} without a Qiwa-documented contract` };
}

/** How many documented Saudis can leave before the official band drops (non-RED only). */
export function marginNote(m: number): Bilingual {
  if (m <= 0) return { ar: 'أي مغادرة لسعودي موثق تُنزل نطاقك', en: 'Any documented Saudi leaving would drop your band' };
  return { ar: `يمكن أن يغادر ${arCount(m, DOCUMENTED_SAUDI)} دون أن ينزل نطاقك`, en: `Up to ${m} documented Saudi${m === 1 ? '' : 's'} can leave before your band drops` };
}

/** Reasons behind an alert (empty when `alert` is false). */
export function nitaqatAlertReasons(s: { total: number; undocumentedSaudis: number; marginToDrop: number; band: NitaqatBand; alert: boolean }): Bilingual[] {
  if (!s.alert || !(s.total > 0)) return [];
  const out: Bilingual[] = [];
  const u = s.undocumentedSaudis;
  if (u > 0) {
    const ar = u === 1 ? `${SAUDI.one} عقده غير موثق في قوى — لا يُحتسب في نسبتك الرسمية`
      : u === 2 ? `${SAUDI.two} عقداهما غير موثقين في قوى — لا يُحتسبان في نسبتك الرسمية`
        : `${arCount(u, SAUDI)} عقودهم غير موثقة في قوى — لا يُحتسبون في نسبتك الرسمية`;
    out.push({ ar, en: `${enSaudis(u)} without a Qiwa-documented contract — not counted in your official rate` });
  }
  if (s.band === 'RED') {
    out.push({ ar: 'نسبتك الرسمية في النطاق الأحمر', en: 'Your official rate is in the red band' });
  } else if (s.marginToDrop <= 1) {
    const n = s.marginToDrop + 1;
    out.push({
      ar: n === 1 ? 'مغادرة سعودي موثق واحد تُنزل نطاقك' : 'مغادرة سعوديين موثقين اثنين تُنزل نطاقك',
      en: `${n} documented Saudi${n === 1 ? '' : 's'} leaving would drop your band`,
    });
  }
  return out;
}
