import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere, resolveOrgId } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import { CreateEventDto, UpdateEventDto } from './events.dto';

// Allowed status transitions for the event lifecycle state machine.
const TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'COMPLETED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthenticatedUser, status?: EventStatus) {
    return this.prisma.event.findMany({
      where: tenantWhere(user, { deletedAt: null, ...(status ? { status } : {}) }),
      orderBy: { startDate: 'desc' },
      include: { venue: { select: { id: true, name: true, arabicName: true } } },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const event = await this.prisma.event.findFirst({
      where: tenantWhere(user, { id, deletedAt: null }),
      include: { venue: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  create(user: AuthenticatedUser, dto: CreateEventDto) {
    const organizationId = resolveOrgId(user, dto.organizationId);
    const { organizationId: _o, ...rest } = dto;
    return this.prisma.event.create({
      data: {
        ...rest,
        organizationId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        doorsOpenTime: dto.doorsOpenTime ? new Date(dto.doorsOpenTime) : undefined,
      },
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateEventDto) {
    await this.findOne(user, id);
    const { organizationId: _o, venueId: _v, startDate, endDate, doorsOpenTime, ...rest } = dto;
    return this.prisma.event.update({
      where: { id },
      data: {
        ...rest,
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
        ...(doorsOpenTime ? { doorsOpenTime: new Date(doorsOpenTime) } : {}),
      },
    });
  }

  async setStatus(user: AuthenticatedUser, id: string, status: EventStatus) {
    const event = await this.findOne(user, id);
    const allowed = TRANSITIONS[event.status];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition event from ${event.status} to ${status}`,
      );
    }
    return this.prisma.event.update({ where: { id }, data: { status } });
  }
}
