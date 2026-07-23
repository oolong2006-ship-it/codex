import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CrowdService } from './crowd.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/rbac';
import { AuthenticatedUser } from '../common/types';

@ApiTags('crowd')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('crowd')
export class CrowdController {
  constructor(private readonly service: CrowdService) {}

  @Get('current')
  @ApiQuery({ name: 'venueId', required: false })
  @RequirePermissions(PERMISSIONS.CROWD_READ)
  current(@CurrentUser() user: AuthenticatedUser, @Query('venueId') venueId?: string) {
    return this.service.current(user, venueId);
  }

  @Get('history/:zoneId')
  @ApiQuery({ name: 'limit', required: false })
  @RequirePermissions(PERMISSIONS.CROWD_READ)
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('zoneId') zoneId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.history(user, zoneId, limit ? Number(limit) : 60);
  }
}
