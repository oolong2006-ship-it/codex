import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { CreateAlertDto, AlertQueryDto } from './alerts.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/rbac';
import { AuthenticatedUser } from '../common/types';

@ApiTags('alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ALERTS_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: AlertQueryDto) {
    return this.service.findAll(user, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ALERTS_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAlertDto) {
    return this.service.create(user, dto);
  }

  @Post(':id/acknowledge')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ALERTS_MANAGE)
  acknowledge(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.acknowledge(user, id);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ALERTS_MANAGE)
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.resolve(user, id);
  }
}
