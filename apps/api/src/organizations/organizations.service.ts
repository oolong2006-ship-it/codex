import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types';
import { CreateOrganizationDto, UpdateOrganizationDto } from './organizations.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthenticatedUser) {
    // Super admin sees all; others only their own organization.
    const where = user.isSuperAdmin
      ? { deletedAt: null }
      : { id: user.organizationId ?? '__none__', deletedAt: null };
    return this.prisma.organization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, venues: true, events: true } } },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    if (!user.isSuperAdmin && user.organizationId !== id) {
      throw new ForbiddenException('Cannot access another organization');
    }
    const org = await this.prisma.organization.findFirst({ where: { id, deletedAt: null } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  create(user: AuthenticatedUser, dto: CreateOrganizationDto) {
    if (!user.isSuperAdmin) {
      throw new ForbiddenException('Only super admin can create organizations');
    }
    return this.prisma.organization.create({ data: dto });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateOrganizationDto) {
    await this.findOne(user, id);
    if (!user.isSuperAdmin && dto.status) {
      throw new ForbiddenException('Only super admin can change organization status');
    }
    return this.prisma.organization.update({ where: { id }, data: dto });
  }
}
