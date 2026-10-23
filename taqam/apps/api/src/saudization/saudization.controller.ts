import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DEFAULT_NITAQAT_THRESHOLDS, hiresNeededForBand, NitaqatBand, nitaqatBand, saudizationRate } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../shared/scope.service';
import { CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';

const ORDER: NitaqatBand[] = ['RED', 'LOW_GREEN', 'MID_GREEN', 'HIGH_GREEN', 'PLATINUM'];

export function nextBand(band: NitaqatBand): NitaqatBand | null {
  const i = ORDER.indexOf(band);
  return i < ORDER.length - 1 ? ORDER[i + 1] : null;
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
    const rows = await this.prisma.employee.groupBy({
      by: ['branchId', 'isSaudi'],
      where: { companyId: u.companyId, status: { not: 'TERMINATED' } },
      _count: { _all: true },
    });
    const total = rows.reduce((s, r) => s + r._count._all, 0);
    const saudis = rows.filter((r) => r.isSaudi).reduce((s, r) => s + r._count._all, 0);
    return { rows, total, saudis };
  }

  @Get()
  async overview(@CurrentUser() u: AuthUser) {
    const { rows, total, saudis } = await this.counts(u);
    const rate = saudizationRate(saudis, total);
    const band = nitaqatBand(rate);
    const nb = nextBand(band);
    const branches = await this.prisma.branch.findMany({ where: { companyId: u.companyId }, orderBy: { createdAt: 'asc' } });
    return {
      company: {
        total,
        saudis,
        nonSaudis: total - saudis,
        rate,
        band,
        nextBand: nb,
        hiresToNextBand: nb ? hiresNeededForBand(saudis, total, nb) : 0,
      },
      branches: branches.map((b) => {
        const bt = rows.filter((r) => r.branchId === b.id).reduce((s, r) => s + r._count._all, 0);
        const bs = rows.filter((r) => r.branchId === b.id && r.isSaudi).reduce((s, r) => s + r._count._all, 0);
        const br = saudizationRate(bs, bt);
        const bb = nitaqatBand(br);
        const bn = nextBand(bb);
        return {
          branchId: b.id,
          branchName: b.nameAr,
          total: bt,
          saudis: bs,
          rate: br,
          band: bb,
          hiresToNextBand: bn ? hiresNeededForBand(bs, bt, bn) : 0,
        };
      }),
      thresholds: DEFAULT_NITAQAT_THRESHOLDS,
    };
  }

  @Get('simulate')
  async simulate(@CurrentUser() u: AuthUser, @Query('addSaudis') addSaudis?: string, @Query('addNonSaudis') addNonSaudis?: string) {
    const { total, saudis } = await this.counts(u);
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
