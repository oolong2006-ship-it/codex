import { LeaveStatusJob } from './leave-status.job';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('LeaveStatusJob.syncLeaveStatuses (review #8)', () => {
  function make() {
    const prisma = { employee: { updateMany: jest.fn(async ({ data }: { data: { status: string } }) => ({ count: data.status === 'ON_LEAVE' ? 2 : 1 })) } };
    return { job: new LeaveStatusJob(prisma as never), prisma };
  }
  const coveringToday = { status: 'APPROVED', startDate: { lte: D('2026-11-10') }, endDate: { gte: D('2026-11-10') } };

  it('marks ACTIVE employees with an approved leave covering today ON_LEAVE, and returns ON_LEAVE employees without one to ACTIVE', async () => {
    const { job, prisma } = make();
    const res = await job.syncLeaveStatuses('2026-11-10');
    expect(prisma.employee.updateMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', leaveRequests: { some: coveringToday } },
      data: { status: 'ON_LEAVE' },
    });
    expect(prisma.employee.updateMany).toHaveBeenCalledWith({
      where: { status: 'ON_LEAVE', leaveRequests: { none: coveringToday } },
      data: { status: 'ACTIVE' },
    });
    expect(res).toEqual({ onLeave: 2, active: 1 });
  });

  it('never touches TERMINATED employees and can be scoped to one employee or company', async () => {
    const { job, prisma } = make();
    await job.syncLeaveStatuses('2026-11-10', { employeeId: 'e1', companyId: 'c1' });
    for (const [arg] of prisma.employee.updateMany.mock.calls as unknown as [{ where: Record<string, unknown> }][]) {
      expect(arg.where).toMatchObject({ id: 'e1', companyId: 'c1' });
      expect(['ACTIVE', 'ON_LEAVE']).toContain(arg.where.status);
    }
  });

  it('runs daily at 00:10 Riyadh time', () => {
    const { job, prisma } = make();
    const spy = jest.spyOn(job, 'syncLeaveStatuses');
    void job.daily();
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(prisma.employee.updateMany).toHaveBeenCalled();
    const cron = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', LeaveStatusJob.prototype.daily);
    expect(cron).toMatchObject({ cronTime: '0 10 0 * * *', timeZone: 'Asia/Riyadh' });
  });
});
