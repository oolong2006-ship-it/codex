import { Injectable, NotFoundException } from '@nestjs/common';
import { GateStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere, resolveOrgId } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import { CreateGateDto, UpdateGateDto } from './gates.dto';

@Injectable()
export class GatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthenticatedUser, venueId?: string) {
    return this.prisma.gate.findMany({
      where: tenantWhere(user, { deletedAt: null, ...(venueId ? { venueId } : {}) }),
      orderBy: { code: 'asc' },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const gate = await this.prisma.gate.findFirst({
      where: tenantWhere(user, { id, deletedAt: null }),
    });
    if (!gate) throw new NotFoundException('Gate not found');
    return gate;
  }

  create(user: AuthenticatedUser, dto: CreateGateDto) {
    const organizationId = resolveOrgId(user, dto.organizationId);
    const { organizationId: _o, ...data } = dto;
    return this.prisma.gate.create({ data: { ...data, organizationId } });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateGateDto) {
    await this.findOne(user, id);
    const { organizationId: _o, venueId: _v, ...data } = dto;
    return this.prisma.gate.update({ where: { id }, data });
  }

  async setStatus(user: AuthenticatedUser, id: string, status: GateStatus) {
    await this.findOne(user, id);
    return this.prisma.gate.update({ where: { id }, data: { status } });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.findOne(user, id);
    return this.prisma.gate.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
