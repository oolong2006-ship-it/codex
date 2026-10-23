import { Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { CycleStatus, Prisma, ReviewStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { ScopeService } from '../shared/scope.service';
import { ADMIN, CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';
import { day } from '../common/dates';
import { badRequest, notFound } from '../common/errors';
import { fullName } from '../employees/employee.view';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CycleDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @Matches(DATE) startDate: string;
  @ApiProperty() @Matches(DATE) endDate: string;
}
export class UpdateCycleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) startDate?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) endDate?: string;
  @ApiPropertyOptional({ enum: CycleStatus }) @IsOptional() @IsEnum(CycleStatus) status?: CycleStatus;
}
export class GoalDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsNumber() @Min(0) @Max(100) weight: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() @Min(1) @Max(5) score?: number | null;
}
export class UpdateReviewDto {
  @ApiPropertyOptional({ type: [GoalDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GoalDto) goals?: GoalDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() comments?: string;
  @ApiPropertyOptional({ enum: ReviewStatus }) @IsOptional() @IsEnum(ReviewStatus) status?: ReviewStatus;
}

export const DEFAULT_GOALS = [
  { title: 'جودة العمل وخدمة العملاء', weight: 40, score: null },
  { title: 'الالتزام بالحضور والأنظمة', weight: 30, score: null },
  { title: 'العمل الجماعي والمبادرة', weight: 30, score: null },
];

/** Weighted average of scored goals (1–5), 2 decimals; null when nothing scored. */
export function weightedScore(goals: { weight: number; score?: number | null }[]): number | null {
  const scored = goals.filter((g) => typeof g.score === 'number' && g.weight > 0);
  const w = scored.reduce((s, g) => s + g.weight, 0);
  if (!w) return null;
  return Math.round((scored.reduce((s, g) => s + g.weight * (g.score as number), 0) / w) * 100) / 100;
}

@ApiTags('performance')
@ApiBearerAuth()
@Controller('performance')
export class PerformanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  private async cycleView(id: string) {
    const c = await this.prisma.reviewCycle.findUniqueOrThrow({ where: { id } });
    const [reviewsCount, completedCount] = await Promise.all([
      this.prisma.performanceReview.count({ where: { cycleId: id } }),
      this.prisma.performanceReview.count({ where: { cycleId: id, status: 'SUBMITTED' } }),
    ]);
    return { ...c, reviewsCount, completedCount };
  }

  @Roles(...STAFF)
  @Get('cycles')
  async cycles(@CurrentUser() u: AuthUser) {
    const cs = await this.prisma.reviewCycle.findMany({ where: { companyId: u.companyId }, orderBy: { startDate: 'desc' } });
    return Promise.all(cs.map((c) => this.cycleView(c.id)));
  }

  @Roles(...ADMIN)
  @Post('cycles')
  async createCycle(@CurrentUser() u: AuthUser, @Body() dto: CycleDto) {
    if (dto.endDate < dto.startDate) throw badRequest('endDate before startDate', 'تاريخ النهاية قبل البداية');
    const c = await this.prisma.reviewCycle.create({
      data: { companyId: u.companyId, name: dto.name, startDate: day(dto.startDate), endDate: day(dto.endDate) },
    });
    await this.audit.log(u, 'CREATE', 'ReviewCycle', c.id, dto);
    return this.cycleView(c.id);
  }

  @Roles(...ADMIN)
  @Patch('cycles/:id')
  async updateCycle(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateCycleDto) {
    const c = await this.prisma.reviewCycle.findFirst({ where: { id, companyId: u.companyId } });
    if (!c) throw notFound('Cycle', 'دورة التقييم غير موجودة');
    await this.prisma.reviewCycle.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.startDate ? { startDate: day(dto.startDate) } : {}),
        ...(dto.endDate ? { endDate: day(dto.endDate) } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    if (dto.status === 'ACTIVE') {
      const emps = await this.prisma.employee.findMany({
        where: { companyId: u.companyId, status: { not: 'TERMINATED' } },
        select: { id: true, managerId: true },
      });
      await this.prisma.performanceReview.createMany({
        data: emps.map((e) => ({
          companyId: u.companyId,
          cycleId: id,
          employeeId: e.id,
          reviewerId: e.managerId,
          goals: DEFAULT_GOALS as unknown as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
    }
    await this.audit.log(u, 'UPDATE', 'ReviewCycle', id, dto);
    return this.cycleView(id);
  }

  @Roles(...STAFF)
  @Get('reviews')
  async reviews(@CurrentUser() u: AuthUser, @Query('cycleId') cycleId?: string) {
    const rs = await this.prisma.performanceReview.findMany({
      where: { companyId: u.companyId, ...(cycleId ? { cycleId } : {}), employee: this.scope.employeeWhere(u) },
      include: {
        employee: { select: { id: true, firstNameAr: true, lastNameAr: true, jobTitle: true, employeeNumber: true, branch: { select: { nameAr: true } } } },
        reviewer: { select: { firstNameAr: true, lastNameAr: true } },
      },
      orderBy: { employee: { employeeNumber: 'asc' } },
    });
    return rs.map(({ employee: e, reviewer, ...r }) => ({
      ...r,
      employee: { id: e.id, name: fullName(e), jobTitle: e.jobTitle, employeeNumber: e.employeeNumber, branchName: e.branch?.nameAr ?? null },
      reviewerName: reviewer ? fullName(reviewer) : null,
    }));
  }

  @Roles('OWNER', 'HR_ADMIN', 'BRANCH_MANAGER')
  @Patch('reviews/:id')
  async updateReview(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateReviewDto) {
    const r = await this.prisma.performanceReview.findFirst({ where: { id, companyId: u.companyId }, include: { cycle: true } });
    if (!r) throw notFound('Review', 'التقييم غير موجود');
    await this.scope.employee(u, r.employeeId);
    if (r.cycle.status === 'CLOSED') throw badRequest('Cycle is closed', 'دورة التقييم مغلقة');
    const goals = dto.goals ?? (r.goals as unknown as GoalDto[]);
    const updated = await this.prisma.performanceReview.update({
      where: { id },
      data: {
        goals: goals as unknown as Prisma.InputJsonValue,
        overallScore: weightedScore(goals),
        ...(dto.comments !== undefined ? { comments: dto.comments } : {}),
        ...(dto.status ? { status: dto.status, submittedAt: dto.status === 'SUBMITTED' ? new Date() : null } : {}),
      },
    });
    await this.audit.log(u, 'UPDATE', 'PerformanceReview', id, dto);
    return updated;
  }
}

@Module({ controllers: [PerformanceController] })
export class PerformanceModule {}
