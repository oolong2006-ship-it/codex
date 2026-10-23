import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { badRequest } from '../common/errors';
import { AdjustmentDto, CreateRunDto } from './payroll.dto';
import { PayrollService } from './payroll.service';

@ApiTags('payroll')
@ApiBearerAuth()
@Roles('OWNER', 'HR_ADMIN', 'PAYROLL')
@Controller('payroll')
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  @Get('runs')
  runs(@CurrentUser() u: AuthUser) {
    return this.svc.runs(u);
  }

  @Post('runs')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateRunDto) {
    return this.svc.createRun(u, dto.period);
  }

  @Get('runs/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.detail(u, id);
  }

  @HttpCode(200)
  @Post('runs/:id/calculate')
  calculate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.calculate(u, id);
  }

  @HttpCode(200)
  @Post('runs/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.approve(u, id);
  }

  @HttpCode(200)
  @Post('runs/:id/mark-paid')
  markPaid(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.markPaid(u, id);
  }

  @Delete('runs/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }

  @ApiProduces('text/csv')
  @Get('runs/:id/wps')
  async wps(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('validate') validate: string, @Res({ passthrough: true }) res: Response) {
    const r = await this.svc.wps(u, id);
    if (validate === '1' || validate === 'true') {
      if (r.errors.length) {
        throw badRequest('WPS validation failed', 'يوجد أخطاء في ملف حماية الأجور', { errors: r.errors, count: r.count, totalNet: r.totalNet });
      }
      return { errors: [], count: r.count, totalNet: r.totalNet };
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wps-${r.period}.csv"`);
    res.setHeader('X-WPS-Errors', String(r.errors.length));
    return r.csv;
  }

  @Get('payslips/:id')
  payslip(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.payslip(u, id);
  }

  @Get('adjustments')
  adjustments(@CurrentUser() u: AuthUser, @Query() q: { period?: string; employeeId?: string }) {
    return this.svc.adjustments(u, q);
  }

  @Post('adjustments')
  createAdjustment(@CurrentUser() u: AuthUser, @Body() dto: AdjustmentDto) {
    return this.svc.createAdjustment(u, dto);
  }

  @Delete('adjustments/:id')
  deleteAdjustment(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.deleteAdjustment(u, id);
  }
}
