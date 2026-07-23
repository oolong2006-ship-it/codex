import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { QueuesService } from './queues.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/rbac';
import { AuthenticatedUser } from '../common/types';

@ApiTags('queues')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('queues')
export class QueuesController {
  constructor(private readonly service: QueuesService) {}

  @Get('current')
  @ApiQuery({ name: 'venueId', required: false })
  @RequirePermissions(PERMISSIONS.QUEUES_READ)
  current(@CurrentUser() user: AuthenticatedUser, @Query('venueId') venueId?: string) {
    return this.service.current(user, venueId);
  }

  @Get('forecast/:gateId')
  @RequirePermissions(PERMISSIONS.QUEUES_READ)
  forecast(@CurrentUser() user: AuthenticatedUser, @Param('gateId') gateId: string) {
    return this.service.forecast(user, gateId);
  }
}
