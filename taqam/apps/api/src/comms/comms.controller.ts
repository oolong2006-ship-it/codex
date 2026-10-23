import { Body, Controller, Delete, Get, HttpCode, Module, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { NotifyService } from '../shared/notifications.service';
import { ADMIN, ALL_ROLES, CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { badRequest, notFound } from '../common/errors';

export class AnnouncementDto {
  @ApiProperty() @IsString() @MinLength(2) title: string;
  @ApiProperty() @IsString() @MinLength(2) body: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string | null;
}

export function announcementsWhere(u: AuthUser) {
  const scoped = u.role === 'EMPLOYEE' || u.role === 'BRANCH_MANAGER';
  return {
    companyId: u.companyId,
    ...(scoped ? { OR: [{ branchId: null }, ...(u.branchId ? [{ branchId: u.branchId }] : [])] } : {}),
  };
}

@ApiTags('announcements & notifications')
@ApiBearerAuth()
@Controller()
export class CommsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
  ) {}

  @Roles(...ALL_ROLES)
  @Get('announcements')
  async announcements(@CurrentUser() u: AuthUser) {
    const list = await this.prisma.announcement.findMany({
      where: announcementsWhere(u),
      include: { branch: { select: { id: true, nameAr: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return list.map(({ branch, ...a }) => ({ ...a, branchName: branch?.nameAr ?? null }));
  }

  @Roles(...ADMIN)
  @Post('announcements')
  async createAnnouncement(@CurrentUser() u: AuthUser, @Body() dto: AnnouncementDto) {
    if (dto.branchId && !(await this.prisma.branch.findFirst({ where: { id: dto.branchId, companyId: u.companyId } }))) {
      throw badRequest('Invalid branchId', 'الفرع غير موجود');
    }
    const a = await this.prisma.announcement.create({
      data: { companyId: u.companyId, title: dto.title, body: dto.body, branchId: dto.branchId || null, authorId: u.id, authorName: u.name },
    });
    const users = await this.prisma.user.findMany({
      where: { companyId: u.companyId, isActive: true, id: { not: u.id }, ...(a.branchId ? { employee: { branchId: a.branchId } } : {}) },
      select: { id: true },
    });
    await this.notify.toUsers(u.companyId, users.map((x) => x.id), `إعلان: ${a.title}`, a.body.slice(0, 140), '/announcements');
    await this.audit.log(u, 'CREATE', 'Announcement', a.id, dto);
    return a;
  }

  @Roles(...ADMIN)
  @Delete('announcements/:id')
  async deleteAnnouncement(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const a = await this.prisma.announcement.findFirst({ where: { id, companyId: u.companyId } });
    if (!a) throw notFound('Announcement', 'الإعلان غير موجود');
    await this.prisma.announcement.delete({ where: { id } });
    await this.audit.log(u, 'DELETE', 'Announcement', id);
    return { ok: true };
  }

  @Roles(...ALL_ROLES)
  @Get('notifications')
  notifications(@CurrentUser() u: AuthUser) {
    return this.prisma.notification.findMany({
      where: { userId: u.id, companyId: u.companyId },
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Roles(...ALL_ROLES)
  @HttpCode(200)
  @Post('notifications/read-all')
  async readAll(@CurrentUser() u: AuthUser) {
    const r = await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true, count: r.count };
  }

  @Roles(...ALL_ROLES)
  @HttpCode(200)
  @Post('notifications/:id/read')
  async read(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId: u.id } });
    if (!n) throw notFound('Notification', 'الإشعار غير موجود');
    return this.prisma.notification.update({ where: { id }, data: { readAt: n.readAt ?? new Date() } });
  }
}

@Module({ controllers: [CommsController] })
export class CommsModule {}
