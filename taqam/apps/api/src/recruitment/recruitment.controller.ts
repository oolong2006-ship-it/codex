import { Body, Controller, Delete, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { CandidateStage, JobStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { ADMIN, CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';
import { badRequest, notFound } from '../common/errors';

export class JobDto {
  @ApiProperty() @IsString() @MinLength(2) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string | null;
  @ApiProperty({ example: 'FULL_TIME' }) @IsString() employmentType: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: JobStatus }) @IsOptional() @IsEnum(JobStatus) status?: JobStatus;
}
export class UpdateJobDto extends PartialType(JobDto) {}

export class CandidateDto {
  @ApiProperty() @IsString() @MinLength(2) name: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) expectedSalary?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
export class UpdateCandidateDto extends PartialType(CandidateDto) {
  @ApiPropertyOptional({ enum: CandidateStage }) @IsOptional() @IsEnum(CandidateStage) stage?: CandidateStage;
}

const jobInclude = {
  branch: { select: { id: true, nameAr: true } },
  department: { select: { id: true, name: true } },
  _count: { select: { candidates: true } },
} as const;

@ApiTags('recruitment')
@ApiBearerAuth()
@Controller()
export class RecruitmentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view<T extends { _count: { candidates: number } }>(j: T) {
    const { _count, ...rest } = j;
    return { ...rest, candidatesCount: _count.candidates };
  }

  private async refs(u: AuthUser, dto: Partial<JobDto>) {
    if (dto.branchId && !(await this.prisma.branch.findFirst({ where: { id: dto.branchId, companyId: u.companyId } }))) {
      throw badRequest('Invalid branchId', 'الفرع غير موجود');
    }
    if (dto.departmentId && !(await this.prisma.department.findFirst({ where: { id: dto.departmentId, companyId: u.companyId } }))) {
      throw badRequest('Invalid departmentId', 'القسم غير موجود');
    }
  }

  private async job(u: AuthUser, id: string) {
    const j = await this.prisma.jobOpening.findFirst({ where: { id, companyId: u.companyId } });
    if (!j) throw notFound('Job', 'الوظيفة غير موجودة');
    return j;
  }

  @Roles(...STAFF)
  @Get('jobs')
  async jobs(@CurrentUser() u: AuthUser) {
    const js = await this.prisma.jobOpening.findMany({ where: { companyId: u.companyId }, include: jobInclude, orderBy: { createdAt: 'desc' } });
    return js.map((j) => this.view(j));
  }

  @Roles(...STAFF)
  @Get('jobs/:id')
  async jobDetail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.job(u, id);
    return this.view(await this.prisma.jobOpening.findUniqueOrThrow({ where: { id }, include: jobInclude }));
  }

  @Roles(...ADMIN)
  @Post('jobs')
  async createJob(@CurrentUser() u: AuthUser, @Body() dto: JobDto) {
    await this.refs(u, dto);
    const j = await this.prisma.jobOpening.create({ data: { ...dto, companyId: u.companyId }, include: jobInclude });
    await this.audit.log(u, 'CREATE', 'JobOpening', j.id, dto);
    return this.view(j);
  }

  @Roles(...ADMIN)
  @Patch('jobs/:id')
  async updateJob(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateJobDto) {
    await this.job(u, id);
    await this.refs(u, dto);
    const j = await this.prisma.jobOpening.update({ where: { id }, data: dto, include: jobInclude });
    await this.audit.log(u, 'UPDATE', 'JobOpening', id, dto);
    return this.view(j);
  }

  @Roles(...ADMIN)
  @Delete('jobs/:id')
  async deleteJob(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.job(u, id);
    await this.prisma.jobOpening.delete({ where: { id } });
    await this.audit.log(u, 'DELETE', 'JobOpening', id);
    return { ok: true };
  }

  @Roles(...STAFF)
  @Get('jobs/:id/candidates')
  async candidates(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.job(u, id);
    return this.prisma.candidate.findMany({ where: { jobId: id, companyId: u.companyId }, orderBy: { createdAt: 'asc' } });
  }

  @Roles(...ADMIN)
  @Post('jobs/:id/candidates')
  async addCandidate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CandidateDto) {
    await this.job(u, id);
    const c = await this.prisma.candidate.create({ data: { ...dto, jobId: id, companyId: u.companyId } });
    await this.audit.log(u, 'CREATE', 'Candidate', c.id, dto);
    return c;
  }

  @Roles(...ADMIN)
  @Patch('candidates/:id')
  async updateCandidate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateCandidateDto) {
    const c = await this.prisma.candidate.findFirst({ where: { id, companyId: u.companyId } });
    if (!c) throw notFound('Candidate', 'المرشح غير موجود');
    const updated = await this.prisma.candidate.update({ where: { id }, data: dto });
    await this.audit.log(u, dto.stage && dto.stage !== c.stage ? 'MOVE_STAGE' : 'UPDATE', 'Candidate', id, dto);
    return updated;
  }

  @Roles(...ADMIN)
  @Delete('candidates/:id')
  async deleteCandidate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.candidate.findFirst({ where: { id, companyId: u.companyId } });
    if (!c) throw notFound('Candidate', 'المرشح غير موجود');
    await this.prisma.candidate.delete({ where: { id } });
    await this.audit.log(u, 'DELETE', 'Candidate', id);
    return { ok: true };
  }
}

@Module({ controllers: [RecruitmentController] })
export class RecruitmentModule {}
