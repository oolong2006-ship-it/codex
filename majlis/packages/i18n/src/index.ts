import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";

export const directionOf = (locale: Locale): "rtl" | "ltr" => (locale === "ar" ? "rtl" : "ltr");

type Catalog = typeof ar;

/** Dot-separated paths to leaf strings of the Arabic (source-of-truth) catalog. */
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type MessageKey = Paths<Catalog>;

export const catalogs: Record<Locale, Catalog> = { ar, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

function lookup(catalog: unknown, key: string): string | undefined {
  let node: unknown = catalog;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Translates a key, falling back to Arabic, then to the key itself. */
export function t(
  locale: Locale,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const template = lookup(catalogs[locale], key) ?? lookup(catalogs[defaultLocale], key) ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
