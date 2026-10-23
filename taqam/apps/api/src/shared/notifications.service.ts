import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotifyService {
  constructor(private readonly prisma: PrismaService) {}

  async toUsers(companyId: string, userIds: string[], title: string, body?: string, link?: string) {
    if (!userIds.length) return;
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ companyId, userId, title, body, link })),
    });
  }

  /** Notify the login linked to each employee (if any). */
  async toEmployees(companyId: string, employeeIds: string[], title: string, body?: string, link?: string) {
    if (!employeeIds.length) return;
    const users = await this.prisma.user.findMany({
      where: { companyId, employeeId: { in: employeeIds }, isActive: true },
      select: { id: true },
    });
    await this.toUsers(companyId, users.map((u) => u.id), title, body, link);
  }

  /** Notify admins (+ manager of the given branch). */
  async toApprovers(companyId: string, branchId: string | null, title: string, body?: string, link?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        isActive: true,
        OR: [
          { role: { in: ['OWNER', 'HR_ADMIN'] } },
          ...(branchId ? [{ role: 'BRANCH_MANAGER' as const, employee: { branchId } }] : []),
        ],
      },
      select: { id: true },
    });
    await this.toUsers(companyId, users.map((u) => u.id), title, body, link);
  }
}
