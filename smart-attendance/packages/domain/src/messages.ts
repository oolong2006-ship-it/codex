import ar from './locales/ar.json';
import en from './locales/en.json';
import type { ErrorCode, ReasonCode } from './reason-codes';

export type Locale = 'ar' | 'en';
type Catalog = Record<ReasonCode | ErrorCode, string>;

const CATALOGS: Record<Locale, Catalog> = { ar: ar as Catalog, en: en as Catalog };

/** رسالة الكود بلغة المستخدم، مع الإنجليزية احتياطًا. */
export function message(code: ReasonCode | ErrorCode, locale: Locale): string {
  return CATALOGS[locale][code] ?? CATALOGS.en[code] ?? code;
}

export function bilingual(code: ReasonCode | ErrorCode): { message_ar: string; message_en: string } {
  return { message_ar: message(code, 'ar'), message_en: message(code, 'en') };
}

export const catalogs = CATALOGS;
