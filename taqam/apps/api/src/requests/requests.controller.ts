import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';
import { DecisionDto } from '../leaves/leaves.dto';
import { LoanDto, UpdateLoanDto } from './requests.dto';
import { RequestsService } from './requests.service';

@ApiTags('requests & loans')
@ApiBearerAuth()
@Controller()
export class RequestsController {
  constructor(private readonly svc: RequestsService) {}

  @Roles(...STAFF)
  @Get('requests')
  list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.svc.list(u, q);
  }

  @Roles(...STAFF)
  @HttpCode(200)
  @Post('requests/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.svc.decide(u, id, true, dto.comment);
  }

  @Roles(...STAFF)
  @HttpCode(200)
  @Post('requests/:id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.svc.decide(u, id, false, dto.comment);
  }

  @Roles('OWNER', 'HR_ADMIN', 'PAYROLL')
  @Get('loans')
  loans(@CurrentUser() u: AuthUser, @Query() q: { status?: string; employeeId?: string }) {
    return this.svc.loans(u, q);
  }

  @Roles('OWNER', 'HR_ADMIN', 'PAYROLL')
  @Post('loans')
  createLoan(@CurrentUser() u: AuthUser, @Body() dto: LoanDto) {
    return this.svc.createLoan(u, dto);
  }

  @Roles('OWNER', 'HR_ADMIN', 'PAYROLL')
  @Patch('loans/:id')
  updateLoan(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateLoanDto) {
    return this.svc.updateLoan(u, id, dto);
  }
}
