import { describe, expect, it } from 'vitest';
import { canVisit } from './nav';

describe('canVisit — links only to pages the role may open', () => {
  it('PAYROLL may open payroll and the compliance center but not documents or saudization', () => {
    expect(canVisit('/app/payroll', 'PAYROLL')).toBe(true);
    expect(canVisit('/app/compliance', 'PAYROLL')).toBe(true);
    expect(canVisit('/app/documents', 'PAYROLL')).toBe(false);
    expect(canVisit('/app/saudization', 'PAYROLL')).toBe(false);
  });
  it('OWNER and HR_ADMIN may open all of them; unknown paths and missing roles are refused', () => {
    for (const role of ['OWNER', 'HR_ADMIN'] as const) {
      for (const href of ['/app/payroll', '/app/documents', '/app/saudization', '/app/compliance']) expect(canVisit(href, role)).toBe(true);
    }
    expect(canVisit('/elsewhere', 'OWNER')).toBe(false);
    expect(canVisit('/app/documents', undefined)).toBe(false);
  });
});
