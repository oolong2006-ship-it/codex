import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IncidentsService } from './incidents.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  AddIncidentUpdateDto,
} from './incidents.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/rbac';
import { AuthenticatedUser } from '../common/types';

@ApiTags('incidents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Get()
  @ApiQuery({ name: 'eventId', required: false })
  @RequirePermissions(PERMISSIONS.INCIDENTS_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('eventId') eventId?: string) {
    return this.service.findAll(user, eventId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INCIDENTS_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INCIDENTS_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateIncidentDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.INCIDENTS_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Post(':id/updates')
  @RequirePermissions(PERMISSIONS.INCIDENTS_MANAGE)
  addUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddIncidentUpdateDto,
  ) {
    return this.service.addUpdate(user, id, dto);
  }
}
