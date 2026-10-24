import { toCsv } from '../csv';

describe('toCsv formula-injection guard', () => {
  it("prefixes =HYPERLINK with ' so spreadsheets treat it as text", () => {
    const csv = toCsv([{ n: '=HYPERLINK("x")' }]);
    expect(csv).toContain(`'=HYPERLINK`);
    expect(csv.split('\n')[1]).toBe(`"'=HYPERLINK(""x"")"`);
  });

  it.each(['+1+1', '-2+3', '@SUM(A1)'])('prefixes values starting with %s', (v) => {
    expect(toCsv([{ n: v }]).split('\n')[1]).toBe(`'${v}`);
  });

  it('leaves numbers (including negatives) and plain text untouched', () => {
    expect(toCsv([{ a: -500, b: 'نص', c: 12.5 }]).split('\n')[1]).toBe('-500,نص,12.5');
  });
});
