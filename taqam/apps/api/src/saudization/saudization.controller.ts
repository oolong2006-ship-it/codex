import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  DEFAULT_NITAQAT_THRESHOLDS,
  hiresNeededForBand,
  marginToDrop,
  NitaqatBand,
  nitaqatAlert,
  nitaqatBand,
  saudizationRate,
} from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../shared/scope.service';
import { CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';
import { fullName } from '../employees/employee.view';

const ORDER: NitaqatBand[] = ['RED', 'LOW_GREEN', 'MID_GREEN', 'HIGH_GREEN', 'PLATINUM'];

export function nextBand(band: NitaqatBand): NitaqatBand | null {
  const i = ORDER.indexOf(band);
  return i < ORDER.length - 1 ? ORDER[i + 1] : null;
}

type CountRow = { isSaudi: boolean; qiwaDocumented: boolean; _count: { _all: number } };

/** Same maths as core `officialSaudization`, from grouped counts; zero staff ⇒ all zeros. */
function summary(rows: CountRow[]) {
  const count = (f: (r: CountRow) => boolean) => rows.filter(f).reduce((s, r) => s + r._count._all, 0);
  const total = count(() => true);
  const saudis = count((r) => r.isSaudi);
  const documentedSaudis = count((r) => r.isSaudi && r.qiwaDocumented);
  const officialRate = saudizationRate(documentedSaudis, total);
  const s = {
    total,
    saudis,
    documentedSaudis,
    undocumentedSaudis: saudis - documentedSaudis,
    rate: officialRate,
    officialRate,
    internalRate: saudizationRate(saudis, total),
    band: nitaqatBand(officialRate),
    marginToDrop: marginToDrop(documentedSaudis, total),
  };
  return { ...s, alert: nitaqatAlert(s) };
}

@ApiTags('saudization')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('saudization')
export class SaudizationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  private async counts(u: AuthUser) {
    // a BRANCH_MANAGER sees their own branch's figures (same scope as the dashboard and the undocumented list)
    const rows = await this.prisma.employee.groupBy({
      by: ['branchId', 'isSaudi', 'qiwaDocumented'],
      where: this.scope.employeeWhere(u, { status: { not: 'TERMINATED' } }),
      _count: { _all: true },
    });
    return { rows, ...summary(rows) };
  }

  /**
   * Since 15 Apr 2026 only Saudis whose contracts are documented in Qiwa count for Nitaqat:
   * `rate`/`band` are the official (documented) rate; `internalRate` counts every Saudi.
   */
  @Get()
  async overview(@CurrentUser() u: AuthUser) {
    const { rows, ...company } = await this.counts(u);
    const [branches, undocumented] = await Promise.all([
      this.prisma.branch.findMany({
        where: { companyId: u.companyId, ...(u.role === 'BRANCH_MANAGER' ? { id: u.branchId ?? '__none__' } : {}) },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.employee.findMany({
        where: this.scope.employeeWhere(u, { isSaudi: true, qiwaDocumented: false, status: { not: 'TERMINATED' } }),
        select: { id: true, employeeNumber: true, firstNameAr: true, lastNameAr: true, branchId: true, branch: { select: { nameAr: true } } },
        orderBy: { employeeNumber: 'asc' },
      }),
    ]);
    const nb = nextBand(company.band);
    return {
      /** BRANCH: a branch manager's figures cover their branch only */
      scope: u.role === 'BRANCH_MANAGER' ? ('BRANCH' as const) : ('COMPANY' as const),
      company: {
        ...company,
        nonSaudis: company.total - company.saudis,
        nextBand: nb,
        hiresToNextBand: nb ? hiresNeededForBand(company.documentedSaudis, company.total, nb) : 0,
      },
      branches: branches.map((b) => {
        const s = summary(rows.filter((r) => r.branchId === b.id));
        const bn = nextBand(s.band);
        return {
          branchId: b.id,
          branchName: b.nameAr,
          ...s,
          hiresToNextBand: bn ? hiresNeededForBand(s.documentedSaudis, s.total, bn) : 0,
        };
      }),
      undocumented: undocumented.map((e) => ({
        id: e.id,
        employeeNumber: e.employeeNumber,
        name: fullName(e),
        branchId: e.branchId,
        branchName: e.branch?.nameAr ?? null,
      })),
      thresholds: DEFAULT_NITAQAT_THRESHOLDS,
    };
  }

  @Get('simulate')
  async simulate(@CurrentUser() u: AuthUser, @Query('addSaudis') addSaudis?: string, @Query('addNonSaudis') addNonSaudis?: string) {
    // official count: new hires are assumed to be documented in Qiwa
    const { total, documentedSaudis: saudis } = await this.counts(u);
    const as = Math.max(0, Number(addSaudis) || 0);
    const an = Math.max(0, Number(addNonSaudis) || 0);
    const before = saudizationRate(saudis, total);
    const after = saudizationRate(saudis + as, total + as + an);
    return {
      before: { total, saudis, rate: before, band: nitaqatBand(before) },
      after: { total: total + as + an, saudis: saudis + as, rate: after, band: nitaqatBand(after) },
    };
  }
}

@Module({ controllers: [SaudizationController] })
export class SaudizationModule {}
