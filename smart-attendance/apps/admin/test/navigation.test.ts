import { describe, expect, it } from 'vitest';
import { hasAdminSurface, navFor } from '../lib/nav';

const MANAGER = ['attendance.read', 'employees.read', 'branches.read', 'devices.read', 'attendance.exceptions.decide'];
const EMPLOYEE = ['attendance.punch', 'devices.self'];

describe('navigation by permission', () => {
  it('shows a branch manager the live views but not the management of shifts', () => {
    const hrefs = navFor(MANAGER).map((i) => i.href);
    expect(hrefs).toEqual(expect.arrayContaining(['/', '/exceptions', '/shifts', '/periods', '/employees']));
    expect(hrefs).not.toContain('/shifts/manage');
  });

  it('keeps an employee out of the admin surface', () => {
    expect(hasAdminSurface(EMPLOYEE)).toBe(false);
    expect(navFor(EMPLOYEE)).toEqual([]);
  });

  it('shows shift management only to those who manage shifts', () => {
    expect(navFor([...MANAGER, 'shifts.manage']).map((i) => i.href)).toContain('/shifts/manage');
  });
});
