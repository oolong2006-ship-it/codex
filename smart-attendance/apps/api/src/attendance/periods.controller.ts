import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { auditMeta } from '../common/audit.service';
import { badRequest } from '../common/errors';
import { AuthedRequest, CurrentPrincipal, Principal, RequirePermission } from '../common/principal';
import { PeriodsService } from './periods.service';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

class ReopenDto {
  @ApiProperty({ description: 'سبب إعادة الفتح' }) @IsString() @IsNotEmpty() @Length(3, 500)
  reason!: string;
}

function checkMonth(month: string): string {
  if (!MONTH_RE.test(month)) throw badRequest('VALIDATION_FAILED', { field: 'month', expected: 'YYYY-MM' });
  return month;
}

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('v1/attendance/periods')
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  @Get()
  @RequirePermission('attendance.read')
  @ApiOperation({ summary: 'فترات الحضور وحالتها.' })
  list(@CurrentPrincipal() p: Principal) {
    return this.periods.list(p);
  }

  @Post(':month/lock')
  @HttpCode(200)
  @RequirePermission('payroll.periods.lock')
  @ApiOperation({ summary: 'قفل شهر: يمنع اعتماد الاستثناءات التي تقع فيه.' })
  lock(@CurrentPrincipal() p: Principal, @Param('month') month: string, @Req() req: AuthedRequest) {
    return this.periods.lock(p, checkMonth(month), auditMeta(req, p));
  }

  @Post(':month/reopen')
  @HttpCode(200)
  @RequirePermission('payroll.periods.reopen')
  @ApiOperation({ summary: 'إعادة فتح شهر مقفل (صلاحية خاصة، بسبب مكتوب، وسجل تدقيق).' })
  reopen(@CurrentPrincipal() p: Principal, @Param('month') month: string, @Body() body: ReopenDto, @Req() req: AuthedRequest) {
    return this.periods.reopen(p, checkMonth(month), body.reason, auditMeta(req, p));
  }
}
