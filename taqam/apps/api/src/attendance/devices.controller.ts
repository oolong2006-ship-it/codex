import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { DevicesService } from './devices.service';

const MANAGERS = ['OWNER', 'HR_ADMIN', 'BRANCH_MANAGER'] as const;

/** HR side of ESS device binding (branch managers see their branch only). */
@ApiTags('attendance devices')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller()
export class DevicesController {
  constructor(private readonly svc: DevicesService) {}

  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'PENDING', 'REJECTED', 'REVOKED'] })
  @Get('devices')
  list(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    return this.svc.list(u, status);
  }

  @HttpCode(200)
  @Post('devices/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.approve(u, id);
  }

  @HttpCode(200)
  @Post('devices/:id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.reject(u, id);
  }

  @Delete('employees/:id/devices')
  reset(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.reset(u, id);
  }
}
