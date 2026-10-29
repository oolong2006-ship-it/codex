import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PUNCH_TYPES, PunchType } from '@sa/domain';
import type { Response } from 'express';
import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { auditMeta } from '../common/audit.service';
import { badRequest } from '../common/errors';
import { AuthedRequest, CurrentPrincipal, Principal, RequirePermission } from '../common/principal';
import { toCsv } from './csv';
import { ExceptionRequest, ExceptionsService } from './exceptions.service';
import { SessionsService } from './sessions.service';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const EXCEPTION_STATUSES = ['OPEN', 'APPROVED', 'REJECTED'];

class ExceptionRequestDto {
  @ApiProperty({ enum: ['DECISION_OVERRIDE', 'MISSING_PUNCH'] }) @IsIn(['DECISION_OVERRIDE', 'MISSING_PUNCH'])
  kind!: 'DECISION_OVERRIDE' | 'MISSING_PUNCH';

  @ApiPropertyOptional({ description: 'الحدث المطلوب تصحيح قراره (DECISION_OVERRIDE)' })
  @IsOptional() @IsUUID()
  event_id?: string;

  @ApiPropertyOptional({ enum: PUNCH_TYPES }) @IsOptional() @IsIn(PUNCH_TYPES as unknown as string[])
  punch_type?: PunchType;

  @ApiPropertyOptional({ description: 'وقت البصمة المنسية (ISO8601)' }) @IsOptional() @IsISO8601()
  punch_at?: string;

  @ApiProperty({ description: 'السبب' }) @IsString() @IsNotEmpty() @Length(3, 500)
  reason!: string;
}

class DecisionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

function toExceptionRequest(dto: ExceptionRequestDto): ExceptionRequest {
  if (dto.kind === 'DECISION_OVERRIDE') {
    if (!dto.event_id) throw badRequest('VALIDATION_FAILED', { field: 'event_id' });
    return { kind: 'DECISION_OVERRIDE', event_id: dto.event_id, reason: dto.reason };
  }
  if (!dto.punch_type || !dto.punch_at) throw badRequest('VALIDATION_FAILED', { field: 'punch_type,punch_at' });
  return { kind: 'MISSING_PUNCH', punch_type: dto.punch_type, punch_at: dto.punch_at, reason: dto.reason };
}

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('v1/attendance')
export class RecordsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly exceptions: ExceptionsService,
  ) {}

  @Get('sessions')
  @ApiOperation({ summary: 'جلسات الحضور المشتقة. الموظف: سجلاته، مدير الفرع: فروعه، HR والإدارة: العميل.' })
  listSessions(
    @CurrentPrincipal() p: Principal,
    @Query('employee_id') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    for (const d of [from, to]) if (d && !DATE_RE.test(d)) throw badRequest('VALIDATION_FAILED', { field: 'from/to' });
    return this.sessions.listFor(p, { employeeId, from, to });
  }

  @Get('roster')
  @RequirePermission('attendance.read')
  @ApiOperation({ summary: 'لوحة الحضور اللحظي: الحاضرون الآن، وعدد البصمات المعلقة خلال 24 ساعة.' })
  roster(@CurrentPrincipal() p: Principal) {
    return this.sessions.roster(p);
  }

  @Post('exceptions')
  @HttpCode(201)
  @RequirePermission('attendance.punch')
  @ApiOperation({ summary: 'طلب استثناء على قرار (PENDING/REJECTED) أو تسجيل بصمة منسية ضمن النافذة.' })
  requestException(@CurrentPrincipal() p: Principal, @Body() body: ExceptionRequestDto, @Req() req: AuthedRequest) {
    return this.exceptions.request(p, toExceptionRequest(body), auditMeta(req, p));
  }

  @Get('exceptions')
  @ApiOperation({ summary: 'طلبات الاستثناءات ضمن النطاق.' })
  listExceptions(@CurrentPrincipal() p: Principal, @Query('status') status?: string) {
    if (status && !EXCEPTION_STATUSES.includes(status)) throw badRequest('VALIDATION_FAILED', { field: 'status' });
    return this.exceptions.list(p, status);
  }

  @Post('exceptions/:id/approve')
  @HttpCode(200)
  @RequirePermission('attendance.exceptions.decide')
  @ApiOperation({ summary: 'اعتماد استثناء: يكتب تسوية ويعيد بناء جلسات الموظف.' })
  approve(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: DecisionDto, @Req() req: AuthedRequest) {
    return this.exceptions.decide(p, id, 'approve', body.note, auditMeta(req, p));
  }

  @Post('exceptions/:id/reject')
  @HttpCode(200)
  @RequirePermission('attendance.exceptions.decide')
  @ApiOperation({ summary: 'رفض استثناء.' })
  reject(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: DecisionDto, @Req() req: AuthedRequest) {
    return this.exceptions.decide(p, id, 'reject', body.note, auditMeta(req, p));
  }

  @Get('export.csv')
  @RequirePermission('attendance.read')
  @ApiOperation({ summary: 'كشف الحضور الشهري CSV (UTF-8 مع BOM) ضمن النطاق.' })
  async exportCsv(@CurrentPrincipal() p: Principal, @Query('month') month: string | undefined, @Res() res: Response): Promise<void> {
    if (!month || !MONTH_RE.test(month)) throw badRequest('VALIDATION_FAILED', { field: 'month', expected: 'YYYY-MM' });
    const rows = await this.sessions.exportMonth(p, month);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${month}.csv"`);
    res.send(
      toCsv(
        ['employee_number', 'full_name', 'branch_code', 'business_date', 'status', 'started_at', 'ended_at', 'duration_minutes'],
        rows,
      ),
    );
  }
}
