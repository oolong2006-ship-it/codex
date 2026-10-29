import { csvCell, toCsv } from './csv';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://x")').startsWith("\"'=")).toBe(true);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@sum')).toBe("'@sum");
  });

  it('writes a BOM, a header and CRLF rows; null becomes empty', () => {
    const out = toCsv(['name', 'minutes'], [{ name: 'أحمد', minutes: 480 }, { name: null, minutes: 0 }]);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toBe('﻿name,minutes\r\nأحمد,480\r\n,0\r\n');
  });
});
