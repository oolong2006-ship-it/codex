import { describe, expect, it } from "vitest";
import { parseKeys, signCardToken, verifyCardToken, randomCode } from "@/server/tokens";
import { normalizePhone } from "@/server/phone";
import { applyStamps } from "@/server/domain/stamping";
import { csvCell } from "@/server/domain/customers";
import { personalize } from "@/server/domain/campaigns";

const k1 = "1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const k2 = "2:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("card tokens", () => {
  it("round-trips and rejects tampering", () => {
    const keys = parseKeys(k1);
    const serial = randomCode(16);
    const tok = signCardToken(serial, keys);
    expect(verifyCardToken(tok, keys)).toBe(serial);
    const forged = tok.replace(serial, randomCode(16));
    expect(verifyCardToken(forged, keys)).toBeNull();
    expect(verifyCardToken(tok.slice(0, -1) + (tok.endsWith("A") ? "B" : "A"), keys)).toBeNull();
    expect(verifyCardToken("garbage", keys)).toBeNull();
  });

  it("supports key rotation: new key signs, old key still verifies", () => {
    const old = parseKeys(k1);
    const rotated = parseKeys(`${k2},${k1}`);
    const serial = randomCode(16);
    const oldTok = signCardToken(serial, old);
    expect(verifyCardToken(oldTok, rotated)).toBe(serial);
    expect(signCardToken(serial, rotated).startsWith("K2.")).toBe(true);
    expect(verifyCardToken(signCardToken(serial, rotated), old)).toBeNull();
  });

  it("rejects short secrets", () => {
    expect(() => parseKeys("1:short")).toThrow();
  });
});

describe("phone normalisation (Saudi default)", () => {
  it.each([
    ["0551234567", "+966551234567"],
    ["551234567", "+966551234567"],
    ["966551234567", "+966551234567"],
    ["+966 55 123 4567", "+966551234567"],
    ["00966551234567", "+966551234567"],
    ["٠٥٥١٢٣٤٥٦٧", "+966551234567"],
    ["+971501234567", "+971501234567"],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));

  it.each(["123", "0451234567", "+96612345", "abc"])("rejects %s", (input) => expect(normalizePhone(input)).toBeNull());
});

describe("stamp arithmetic", () => {
  it("rolls over and banks rewards", () => {
    expect(applyStamps(0, 10, 1)).toEqual({ current: 1, earned: 0 });
    expect(applyStamps(9, 10, 1)).toEqual({ current: 0, earned: 1 });
    expect(applyStamps(9, 10, 3)).toEqual({ current: 2, earned: 1 });
    expect(applyStamps(1, 2, 3)).toEqual({ current: 0, earned: 2 });
  });
});

describe("csv safety", () => {
  it("neutralises formulas and quotes", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+966551234567")).toBe("'+966551234567");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(null)).toBe("");
  });
});

describe("campaign personalisation", () => {
  it("uses first name and business", () => {
    expect(personalize("هلا {name} في {business}", { name: "سارة القحطاني", business: "بن" })).toBe("هلا سارة في بن");
  });
});
