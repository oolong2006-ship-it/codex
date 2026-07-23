import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere, resolveOrgId } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { ROLES } from '../common/rbac';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(user: {
    id: string;
    email: string;
    fullName: string;
    arabicName: string | null;
    status: string;
    organizationId: string | null;
    roles: { role: { key: string; name: string } }[];
  }) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      arabicName: user.arabicName,
      status: user.status,
      organizationId: user.organizationId,
      roles: user.roles.map((r) => r.role.key),
    };
  }

  async findAll(user: AuthenticatedUser) {
    const users = await this.prisma.user.findMany({
      where: tenantWhere(user, { deletedAt: null }),
      orderBy: { createdAt: 'desc' },
      include: { roles: { include: { role: true } } },
    });
    return users.map((u) => this.serialize(u));
  }

  private async resolveRoleIds(roleKeys: string[], isSuperAdminActor: boolean) {
    if (!isSuperAdminActor && roleKeys.includes(ROLES.SUPER_ADMIN)) {
      throw new ForbiddenException('Cannot assign SUPER_ADMIN role');
    }
    const roles = await this.prisma.role.findMany({ where: { key: { in: roleKeys } } });
    if (roles.length !== roleKeys.length) {
      throw new BadRequestException('One or more role keys are invalid');
    }
    return roles.map((r) => r.id);
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto) {
    const organizationId = resolveOrgId(actor, dto.organizationId);
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new BadRequestException('Email already in use');

    const roleIds = await this.resolveRoleIds(dto.roleKeys, actor.isSuperAdmin);
    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        fullName: dto.fullName,
        arabicName: dto.arabicName,
        phone: dto.phone,
        organizationId,
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
      include: { roles: { include: { role: true } } },
    });
    return this.serialize(user);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findFirst({ where: tenantWhere(actor, { id }) });
    if (!target) throw new NotFoundException('User not found');

    if (dto.roleKeys) {
      const roleIds = await this.resolveRoleIds(dto.roleKeys, actor.isSuperAdmin);
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      await this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId })),
      });
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        arabicName: dto.arabicName,
        phone: dto.phone,
      },
      include: { roles: { include: { role: true } } },
    });
    return this.serialize(user);
  }
}
