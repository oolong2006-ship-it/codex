import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import { auditMeta } from '../common/audit.service';
import { badRequest } from '../common/errors';
import { AuthedRequest, CurrentPrincipal, Principal, RequirePermission } from '../common/principal';
import { toCsv } from './csv';
import { ShiftsService } from './shifts.service';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

class TemplateDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '08:00', description: 'توقيت محلي HH:MM' }) @Matches(TIME_RE)
  start_time!: string;

  @ApiProperty({ example: '06:00', description: 'أقل من البداية = وردية تنتهي في اليوم التالي' }) @Matches(TIME_RE)
  end_time!: string;

  @ApiProperty({ type: [Number], description: 'أيام ISO: 1 الاثنين … 7 الأحد' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true })
  days!: number[];
}

class AssignShiftDto {
  @ApiProperty() @IsUUID()
  shift_template_id!: string;

  @ApiProperty({ example: '2026-10-01' }) @Matches(DATE_RE)
  valid_from!: string;

  @ApiPropertyOptional({ example: '2026-12-31' }) @IsOptional() @Matches(DATE_RE)
  valid_to?: string;
}

function checkDate(value: string | undefined, field: string): string {
  if (!value || !DATE_RE.test(value)) throw badRequest('VALIDATION_FAILED', { field });
  return value;
}

@ApiTags('shifts')
@ApiBearerAuth()
@Controller('v1')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Post('shift-templates')
  @RequirePermission('shifts.manage')
  @ApiOperation({ summary: 'قالب وردية ثابت: توقيت محلي وأيام الأسبوع.' })
  createTemplate(@CurrentPrincipal() p: Principal, @Body() body: TemplateDto, @Req() req: AuthedRequest) {
    return this.shifts.createTemplate(p, body, auditMeta(req, p));
  }

  @Get('shift-templates')
  @RequirePermission('attendance.read')
  @ApiOperation({ summary: 'قوالب الورديات.' })
  listTemplates(@CurrentPrincipal() p: Principal) {
    return this.shifts.listTemplates(p);
  }

  @Post('employees/:id/shift-assignments')
  @RequirePermission('shifts.manage')
  @ApiOperation({ summary: 'تعيين وردية لموظف بنافذة صلاحية؛ لا يتداخل مع تعيين آخر.' })
  assign(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: AssignShiftDto, @Req() req: AuthedRequest) {
    return this.shifts.assign(p, id, body, auditMeta(req, p));
  }

  @Get('attendance/shift-report')
  @RequirePermission('attendance.read')
  @ApiOperation({ summary: 'تقرير الورديات لفترة: التأخر والخروج المبكر والغياب. format=csv للتصدير.' })
  async report(
    @CurrentPrincipal() p: Principal,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employee_id') employeeId: string | undefined,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const filter = { from: checkDate(from, 'from'), to: checkDate(to, 'to'), employeeId: employeeId || undefined };
    if (format === 'csv') {
      const rows = await this.shifts.reportForExport(p, filter);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="shift-report-${filter.from}-${filter.to}.csv"`);
      return toCsv(
        ['employee_number', 'full_name', 'shift', 'date', 'scheduled_start', 'scheduled_end', 'outcome', 'late_minutes', 'early_leave_minutes', 'started_at', 'ended_at'],
        rows,
      );
    }
    const { timeZone, rows } = await this.shifts.report(p, filter);
    const counts: Record<string, number> = {};
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
    for (const r of rows) {
      counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
      lateMinutes += r.late_minutes;
      earlyLeaveMinutes += r.early_leave_minutes;
    }
    const summary = { ...counts, late_minutes: lateMinutes, early_leave_minutes: earlyLeaveMinutes };
    return { timezone: timeZone, summary, rows };
  }
}
