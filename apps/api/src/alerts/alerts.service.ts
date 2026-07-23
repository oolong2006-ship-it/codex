import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertStatus, Severity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere, resolveOrgId } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import { CreateAlertDto } from './alerts.dto';
import { EventsGateway } from '../realtime/events.gateway';

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: EventsGateway,
  ) {}

  findAll(user: AuthenticatedUser, filters: { status?: AlertStatus; severity?: Severity }) {
    return this.prisma.alert.findMany({
      where: tenantWhere(user, {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
      }),
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async create(user: AuthenticatedUser, dto: CreateAlertDto) {
    const organizationId = resolveOrgId(user, dto.organizationId);
    const { organizationId: _o, ...data } = dto;
    const alert = await this.prisma.alert.create({ data: { ...data, organizationId } });
    this.gateway.emitToOrg(organizationId, 'alert:new', alert);
    return alert;
  }

  private async findOne(user: AuthenticatedUser, id: string) {
    const alert = await this.prisma.alert.findFirst({ where: tenantWhere(user, { id }) });
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  async acknowledge(user: AuthenticatedUser, id: string) {
    const alert = await this.findOne(user, id);
    const updated = await this.prisma.alert.update({
      where: { id: alert.id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), assignedToId: user.id },
    });
    this.gateway.emitToOrg(updated.organizationId, 'alert:updated', updated);
    return updated;
  }

  async resolve(user: AuthenticatedUser, id: string) {
    const alert = await this.findOne(user, id);
    const updated = await this.prisma.alert.update({
      where: { id: alert.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    this.gateway.emitToOrg(updated.organizationId, 'alert:updated', updated);
    return updated;
  }
}
