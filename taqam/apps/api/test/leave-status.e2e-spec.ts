import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { LeaveStatusJob } from '../src/leaves/leave-status.job';
import { addDays, dayStr, todayStr } from '../src/common/dates';

function iban(bank: string, account: string) {
  const bban = bank + account;
  let rem = 0;
  for (const ch of bban + '281000') rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, '0')}${bban}`;
}

describe('Leave status lifecycle (e2e, review #8)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let job: LeaveStatusJob;
  const stamp = Date.now();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let ownerToken = '';
  let companyId = '';
  let branchId = '';
  let sickTypeId = '';

  async function employee(n: number) {
    const emp = await http
      .post('/api/employees')
      .set(auth(ownerToken))
      .send({
        firstNameAr: 'موظف',
        lastNameAr: `إجازة ${n}`,
        nationality: 'SA',
        gender: 'FEMALE',
        nationalId: `10555000${n}0`,
        branchId,
        jobTitle: 'كاشير',
        hireDate: '2022-01-01',
        basicSalary: 5000,
        iban: iban('10', `55500011122233344${n}`),
      })
      .expect(201);
    return emp.body.id as string;
  }
  const status = async (id: string) => (await prisma.employee.findUniqueOrThrow({ where: { id } })).status;
  async function approvedSick(employeeId: string, from: Date, to: Date) {
    const l = await http.post('/api/leaves').set(auth(ownerToken)).send({ employeeId, leaveTypeId: sickTypeId, startDate: dayStr(from), endDate: dayStr(to) }).expect(201);
    await http.post(`/api/leaves/${l.body.id}/approve`).set(auth(ownerToken)).send({}).expect(200);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    job = app.get(LeaveStatusJob);
    await prisma.platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });
    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'شركة الإجازات', sector: 'RESTAURANTS', ownerName: 'مالك', email: `leaveowner${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201);
    ownerToken = reg.body.accessToken;
    const me = await http.get('/api/auth/me').set(auth(ownerToken)).expect(200);
    companyId = me.body.companyId ?? me.body.user?.companyId ?? me.body.company?.id;
    const branch = await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع', city: 'الرياض', lat: 24.7, lng: 46.7, radiusMeters: 150 }).expect(201);
    branchId = branch.body.id;
    const types = await http.get('/api/leave-types').set(auth(ownerToken)).expect(200);
    sickTypeId = types.body.find((t: { code: string }) => t.code === 'SICK').id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('approving a leave that covers today sets ON_LEAVE; the daily sync returns the employee to ACTIVE after it ends', async () => {
    expect(companyId).toBeTruthy();
    const id = await employee(1);
    const today = todayStr();
    await approvedSick(id, addDays(today, -1), addDays(today, 1));
    expect(await status(id)).toBe('ON_LEAVE');

    await job.syncLeaveStatuses(addDays(today, 2), { companyId });
    expect(await status(id)).toBe('ACTIVE');
  });

  it('a future approved leave flips the employee to ON_LEAVE on its start day only', async () => {
    const id = await employee(2);
    const start = addDays(todayStr(), 10);
    await approvedSick(id, start, addDays(start, 2));
    expect(await status(id)).toBe('ACTIVE');

    await job.syncLeaveStatuses(addDays(start, -1), { companyId });
    expect(await status(id)).toBe('ACTIVE');
    await job.syncLeaveStatuses(start, { companyId });
    expect(await status(id)).toBe('ON_LEAVE');
    await job.syncLeaveStatuses(addDays(start, 3), { companyId });
    expect(await status(id)).toBe('ACTIVE');
  });
});
