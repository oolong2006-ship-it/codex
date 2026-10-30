import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CopilotService } from './copilot.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/rbac';
import { AuthenticatedUser } from '../common/types';

@ApiTags('copilot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('copilot')
export class CopilotController {
  constructor(private readonly service: CopilotService) {}

  /** Arabic situation briefing with prioritised actions for the control room. */
  @Get('briefing')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  briefing(@CurrentUser() user: AuthenticatedUser) {
    return this.service.briefing(user);
  }
}
