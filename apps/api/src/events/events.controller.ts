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
import { EventStatus } from '@prisma/client';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto, UpdateEventStatusDto } from './events.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/rbac';
import { AuthenticatedUser } from '../common/types';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly service: EventsService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: EventStatus })
  @RequirePermissions(PERMISSIONS.EVENTS_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: EventStatus) {
    return this.service.findAll(user, status);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EVENTS_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEventDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventStatusDto,
  ) {
    return this.service.setStatus(user, id, dto.status);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.service.update(user, id, dto);
  }
}
