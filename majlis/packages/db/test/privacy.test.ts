import { describe, expect, it } from "vitest";
import { REDACTED, redactPII } from "../src/index.js";

describe("redactPII", () => {
  it.each([
    ["رقمي 0551234567 كلمني", `رقمي ${REDACTED} كلمني`],
    ["جوالي +966 55 123 4567", `جوالي ${REDACTED}`],
    ["٠٥٥١٢٣٤٥٦٧", REDACTED],
    ["ايميلي sara.ali@example.com", `ايميلي ${REDACTED}`],
    ["هويتي 1012345678", `هويتي ${REDACTED}`],
    ["الآيبان SA03 8000 0000 6080 1016 7519", `الآيبان ${REDACTED}`],
  ])("%s", (input, expected) => {
    expect(redactPII(input)).toBe(expected);
  });

  it("keeps ordinary numbers like prices and times", () => {
    expect(redactPII("دفعت 150 ريال الساعة 9:30")).toBe("دفعت 150 ريال الساعة 9:30");
  });
});
