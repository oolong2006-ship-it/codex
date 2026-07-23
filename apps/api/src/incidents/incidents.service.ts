import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere, resolveOrgId } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  AddIncidentUpdateDto,
} from './incidents.dto';
import { EventsGateway } from '../realtime/events.gateway';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: EventsGateway,
  ) {}

  private async nextNumber(organizationId: string): Promise<string> {
    const count = await this.prisma.incident.count({ where: { organizationId } });
    const year = new Date().getFullYear();
    return `INC-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  findAll(user: AuthenticatedUser, eventId?: string) {
    return this.prisma.incident.findMany({
      where: tenantWhere(user, { ...(eventId ? { eventId } : {}) }),
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { assignedTeam: { select: { id: true, name: true } } },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const incident = await this.prisma.incident.findFirst({
      where: tenantWhere(user, { id }),
      include: {
        updates: { orderBy: { createdAt: 'asc' } },
        attachments: true,
        assignedTeam: true,
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async create(user: AuthenticatedUser, dto: CreateIncidentDto) {
    const organizationId = resolveOrgId(user, dto.organizationId);
    const number = await this.nextNumber(organizationId);
    const { organizationId: _o, ...data } = dto;
    const incident = await this.prisma.incident.create({
      data: {
        ...data,
        organizationId,
        number,
        reportedById: user.id,
        // default 30-minute SLA for first resolution target
        slaDueAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    this.gateway.emitToOrg(organizationId, 'incident:new', incident);
    return incident;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateIncidentDto) {
    const incident = await this.findOne(user, id);
    const resolving =
      dto.status && ['RESOLVED', 'CLOSED'].includes(dto.status) && !incident.resolvedAt;
    const updated = await this.prisma.incident.update({
      where: { id: incident.id },
      data: {
        ...dto,
        ...(resolving ? { resolvedAt: new Date() } : {}),
      },
    });
    this.gateway.emitToOrg(updated.organizationId, 'incident:updated', updated);
    return updated;
  }

  async addUpdate(user: AuthenticatedUser, id: string, dto: AddIncidentUpdateDto) {
    const incident = await this.findOne(user, id);
    const update = await this.prisma.incidentUpdate.create({
      data: {
        incidentId: incident.id,
        authorId: user.id,
        message: dto.message,
        statusFrom: dto.statusTo ? incident.status : undefined,
        statusTo: dto.statusTo,
        isInternal: dto.isInternal ?? false,
      },
    });
    if (dto.statusTo && dto.statusTo !== incident.status) {
      await this.prisma.incident.update({
        where: { id: incident.id },
        data: {
          status: dto.statusTo,
          ...(['RESOLVED', 'CLOSED'].includes(dto.statusTo) && !incident.resolvedAt
            ? { resolvedAt: new Date() }
            : {}),
        },
      });
    }
    this.gateway.emitToOrg(incident.organizationId, 'incident:updated', { id: incident.id });
    return update;
  }
}
