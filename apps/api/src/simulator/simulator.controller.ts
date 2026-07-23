import { Body, Controller, Get, Post, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SimulatorService } from './simulator.service';
import { StartSimulationDto } from './simulator.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/rbac';
import { AuthenticatedUser } from '../common/types';

@ApiTags('simulations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('simulations')
export class SimulatorController {
  constructor(private readonly service: SimulatorService) {}

  @Get('scenarios')
  @RequirePermissions(PERMISSIONS.SIMULATIONS_MANAGE)
  scenarios() {
    return this.service.listScenarios();
  }

  @Get('status')
  @RequirePermissions(PERMISSIONS.SIMULATIONS_MANAGE)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.service.status(user);
  }

  @Post('start')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SIMULATIONS_MANAGE)
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartSimulationDto) {
    return this.service.start(user, dto.scenario, dto.eventId);
  }

  @Post('stop')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SIMULATIONS_MANAGE)
  stop(@CurrentUser() user: AuthenticatedUser) {
    return this.service.stop(user);
  }
}
