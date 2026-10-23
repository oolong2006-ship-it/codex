import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';
import { CreateLeaveDto, DecisionDto } from './leaves.dto';
import { LeavesService } from './leaves.service';

@ApiTags('leaves')
@ApiBearerAuth()
@Controller('leaves')
export class LeavesController {
  constructor(private readonly svc: LeavesService) {}

  @Roles(...STAFF)
  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.svc.list(u, q);
  }

  @Roles(...STAFF)
  @Get('balances')
  balances(@CurrentUser() u: AuthUser, @Query('employeeId') employeeId?: string) {
    return this.svc.balances(u, employeeId);
  }

  @Roles('OWNER', 'HR_ADMIN', 'BRANCH_MANAGER')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateLeaveDto) {
    return this.svc.create(u, dto);
  }

  @Roles('OWNER', 'HR_ADMIN', 'BRANCH_MANAGER')
  @HttpCode(200)
  @Post(':id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.svc.decide(u, id, true, dto.comment);
  }

  @Roles('OWNER', 'HR_ADMIN', 'BRANCH_MANAGER')
  @HttpCode(200)
  @Post(':id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.svc.decide(u, id, false, dto.comment);
  }
}
