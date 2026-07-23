import { BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';
import { AuthenticatedUser } from '../common/types';

const user: AuthenticatedUser = {
  id: 'u1',
  email: 'ops@masar34.sa',
  organizationId: 'org1',
  roles: ['OPERATIONS_MANAGER'],
  permissions: [],
  isSuperAdmin: false,
};

function makeService(currentStatus: string) {
  const prisma = {
    event: {
      findFirst: jest.fn().mockResolvedValue({ id: 'e1', status: currentStatus, organizationId: 'org1' }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'e1', ...data })),
    },
  };
  return { service: new EventsService(prisma as never), prisma };
}

describe('EventsService.setStatus (lifecycle state machine)', () => {
  it('allows DRAFT -> SCHEDULED', async () => {
    const { service, prisma } = makeService('DRAFT');
    const res = await service.setStatus(user, 'e1', 'SCHEDULED');
    expect(res.status).toBe('SCHEDULED');
    expect(prisma.event.update).toHaveBeenCalled();
  });

  it('rejects DRAFT -> ACTIVE', async () => {
    const { service } = makeService('DRAFT');
    await expect(service.setStatus(user, 'e1', 'ACTIVE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects transitions out of COMPLETED', async () => {
    const { service } = makeService('COMPLETED');
    await expect(service.setStatus(user, 'e1', 'ACTIVE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows ACTIVE -> PAUSED', async () => {
    const { service } = makeService('ACTIVE');
    const res = await service.setStatus(user, 'e1', 'PAUSED');
    expect(res.status).toBe('PAUSED');
  });
});
