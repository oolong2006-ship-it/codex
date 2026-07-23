import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere, resolveOrgId } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import { CreateVenueDto, UpdateVenueDto } from './venues.dto';

@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthenticatedUser) {
    return this.prisma.venue.findMany({
      where: tenantWhere(user, { deletedAt: null }),
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { zones: true, gates: true, events: true } } },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const venue = await this.prisma.venue.findFirst({
      where: tenantWhere(user, { id, deletedAt: null }),
      include: { zones: true, gates: true },
    });
    if (!venue) throw new NotFoundException('Venue not found');
    return venue;
  }

  create(user: AuthenticatedUser, dto: CreateVenueDto) {
    const organizationId = resolveOrgId(user, dto.organizationId);
    const { organizationId: _omit, ...data } = dto;
    return this.prisma.venue.create({ data: { ...data, organizationId } });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateVenueDto) {
    await this.findOne(user, id);
    const { organizationId: _omit, ...data } = dto;
    return this.prisma.venue.update({ where: { id }, data });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.findOne(user, id);
    return this.prisma.venue.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
