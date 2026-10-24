import { describe, expect, it } from "vitest";
import { catalogs, directionOf, t } from "../src/index.js";

function leafKeys(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("i18n", () => {
  it("keeps en and ar catalogs in sync", () => {
    expect(leafKeys(catalogs.en).sort()).toEqual(leafKeys(catalogs.ar).sort());
  });

  it("has no empty strings", () => {
    for (const catalog of Object.values(catalogs)) {
      for (const key of leafKeys(catalog)) {
        expect(t("ar", key as never).length, key).toBeGreaterThan(0);
      }
    }
  });

  it("interpolates params", () => {
    expect(t("ar", "home.status", { phase: 0 })).toBe("المنصة قيد البناء — المرحلة 0");
  });

  it("is RTL for Arabic and LTR for English", () => {
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });
});
