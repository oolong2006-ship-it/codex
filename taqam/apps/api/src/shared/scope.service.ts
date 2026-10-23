import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { forbidden, notFound } from '../common/errors';

/** Tenant + branch scoping helpers shared by all modules. */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Prisma `where` for employees visible to this user. */
  employeeWhere(user: AuthUser, extra: Prisma.EmployeeWhereInput = {}): Prisma.EmployeeWhereInput {
    const where: Prisma.EmployeeWhereInput = { ...extra, companyId: user.companyId };
    if (user.role === 'BRANCH_MANAGER') where.branchId = user.branchId ?? '__none__';
    if (user.role === 'EMPLOYEE') where.id = user.employeeId ?? '__none__';
    return where;
  }

  /** Branch filter for a BRANCH_MANAGER, or the requested branch for others. */
  branchFilter(user: AuthUser, requested?: string | null): string | undefined {
    if (user.role === 'BRANCH_MANAGER') return user.branchId ?? '__none__';
    return requested || undefined;
  }

  async employee(user: AuthUser, id: string) {
    const emp = await this.prisma.employee.findFirst({ where: this.employeeWhere(user, { id }) });
    if (!emp) throw notFound('Employee', 'الموظف غير موجود');
    return emp;
  }

  assertBranch(user: AuthUser, branchId: string | null | undefined) {
    if (user.role === 'BRANCH_MANAGER' && branchId !== user.branchId) {
      throw forbidden('Branch managers can only manage their own branch', 'مدير الفرع يدير فرعه فقط');
    }
  }

  async branch(user: AuthUser, id: string) {
    const b = await this.prisma.branch.findFirst({ where: { id, companyId: user.companyId } });
    if (!b) throw notFound('Branch', 'الفرع غير موجود');
    return b;
  }
}
