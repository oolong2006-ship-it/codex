import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere, resolveOrgId } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import { CreateTaskDto, UpdateTaskStatusDto } from './tasks.dto';
import { EventsGateway } from '../realtime/events.gateway';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: EventsGateway,
  ) {}

  findAll(user: AuthenticatedUser, status?: TaskStatus) {
    return this.prisma.task.findMany({
      where: tenantWhere(user, { ...(status ? { status } : {}) }),
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: { assignedTeam: { select: { id: true, name: true } } },
      take: 200,
    });
  }

  async create(user: AuthenticatedUser, dto: CreateTaskDto) {
    const organizationId = resolveOrgId(user, dto.organizationId);
    const { organizationId: _o, ...data } = dto;
    const task = await this.prisma.task.create({ data: { ...data, organizationId } });
    this.gateway.emitToOrg(organizationId, 'task:new', task);
    return task;
  }

  async setStatus(user: AuthenticatedUser, id: string, dto: UpdateTaskStatusDto) {
    const task = await this.prisma.task.findFirst({ where: tenantWhere(user, { id }) });
    if (!task) throw new NotFoundException('Task not found');

    const timestamps: Record<string, Date> = {};
    if (dto.status === 'ACCEPTED') timestamps.acceptedAt = new Date();
    if (dto.status === 'ON_SITE') timestamps.onSiteAt = new Date();
    if (dto.status === 'COMPLETED') timestamps.completedAt = new Date();

    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: dto.status,
        ...(dto.notes ? { notes: dto.notes } : {}),
        ...(dto.photoUrl ? { photoUrl: dto.photoUrl } : {}),
        ...timestamps,
      },
    });
    this.gateway.emitToOrg(updated.organizationId, 'task:updated', updated);
    return updated;
  }
}
