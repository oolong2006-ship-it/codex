import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere, resolveOrgId } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import { CreateZoneDto, UpdateZoneDto } from './zones.dto';
import { occupancyPercentage } from '../common/analytics';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, venueId?: string) {
    const zones = await this.prisma.zone.findMany({
      where: tenantWhere(user, { deletedAt: null, ...(venueId ? { venueId } : {}) }),
      orderBy: { name: 'asc' },
    });
    return zones.map((z) => ({
      ...z,
      occupancyPercentage: occupancyPercentage(z.currentOccupancy, z.capacity),
    }));
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const zone = await this.prisma.zone.findFirst({
      where: tenantWhere(user, { id, deletedAt: null }),
    });
    if (!zone) throw new NotFoundException('Zone not found');
    return {
      ...zone,
      occupancyPercentage: occupancyPercentage(zone.currentOccupancy, zone.capacity),
    };
  }

  create(user: AuthenticatedUser, dto: CreateZoneDto) {
    const organizationId = resolveOrgId(user, dto.organizationId);
    const { organizationId: _o, ...data } = dto;
    return this.prisma.zone.create({ data: { ...data, organizationId } });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateZoneDto) {
    await this.findOne(user, id);
    const { organizationId: _o, venueId: _v, ...data } = dto;
    return this.prisma.zone.update({ where: { id }, data });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.findOne(user, id);
    return this.prisma.zone.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
