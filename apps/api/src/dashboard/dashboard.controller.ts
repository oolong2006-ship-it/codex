import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/rbac';
import { AuthenticatedUser } from '../common/types';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.service.overview(user);
  }

  @Get('realtime')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  realtime(@CurrentUser() user: AuthenticatedUser) {
    return this.service.realtime(user);
  }
}
