import { forbidden } from '../common/errors';
import { Principal, branchScope } from '../common/principal';

/**
 * نطاق قراءة سجلات الحضور:
 * - صاحب صلاحية القراءة: كل العميل، أو فروع مدير الفرع (ABAC).
 * - الموظف: سجلاته فقط.
 */
export interface RecordScope {
  /** موظف محدد يُفرض على الاستعلام (وضع الموظف). */
  employeeId: string | null;
  /** فروع مسموحة؛ null = كل العميل. */
  branchIds: string[] | null;
}

export function recordScope(p: Principal): RecordScope {
  if (p.permissions.includes('attendance.read')) return { employeeId: null, branchIds: branchScope(p) };
  if (p.employeeId) return { employeeId: p.employeeId, branchIds: null };
  throw forbidden();
}
