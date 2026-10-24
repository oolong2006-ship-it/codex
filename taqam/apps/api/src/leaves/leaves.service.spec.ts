import { ConflictException } from '@nestjs/common';
import { LeavesService } from './leaves.service';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function make(updateCount: number) {
  const pending = {
    id: 'l1',
    companyId: 'c1',
    employeeId: 'e1',
    status: 'PENDING',
    startDate: D('2026-12-01'),
    endDate: D('2026-12-03'),
    leaveType: { id: 't1', code: 'SICK', nameAr: 'إجازة مرضية' },
  };
  const prisma = {
    leaveRequest: {
      findFirst: jest.fn(async () => pending),
      updateMany: jest.fn(async () => ({ count: updateCount })),
      update: jest.fn(async () => ({ ...pending, status: 'APPROVED', employee: { id: 'e1', firstNameAr: 'أ', lastNameAr: 'ب', branchId: null, branch: null } })),
      findUniqueOrThrow: jest.fn(async () => ({ ...pending, status: 'APPROVED', employee: { id: 'e1', firstNameAr: 'أ', lastNameAr: 'ب', branchId: null, branch: null } })),
    },
    employee: { update: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const notify = { toEmployees: jest.fn(), toApprovers: jest.fn() };
  const scope = { employee: jest.fn(async () => ({ id: 'e1', companyId: 'c1', branchId: null })) };
  const calc = { validate: jest.fn() };
  const statusJob = { syncLeaveStatuses: jest.fn(async () => ({ onLeave: 0, active: 0 })) };
  const svc = new LeavesService(prisma as never, audit as never, notify as never, scope as never, calc as never, statusJob as never);
  return { svc, prisma, audit, notify, statusJob };
}

const hr = { id: 'u1', name: 'مدير', companyId: 'c1', role: 'HR_ADMIN', employeeId: null } as never;

describe('LeavesService.decide', () => {
  it('a decision that loses the PENDING race is a 409 with no side effects (review #11)', async () => {
    const { svc, prisma, audit, notify } = make(0);
    const err = await svc.decide(hr, 'l1', true).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().messageAr).toBe('تمت معالجة هذا الطلب مسبقاً');
    expect(prisma.leaveRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'l1', status: 'PENDING' } }));
    expect(audit.log).not.toHaveBeenCalled();
    expect(notify.toEmployees).not.toHaveBeenCalled();
  });

  it('an approval re-syncs the employee status through the leave status job (review #8)', async () => {
    const { svc, statusJob } = make(1);
    await svc.decide(hr, 'l1', true);
    expect(statusJob.syncLeaveStatuses).toHaveBeenCalledWith(expect.any(String), { employeeId: 'e1' });
  });
});
