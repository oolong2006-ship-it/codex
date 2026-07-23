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
import { TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskStatusDto } from './tasks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/rbac';
import { AuthenticatedUser } from '../common/types';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: TaskStatus })
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: TaskStatus) {
    return this.service.findAll(user, status);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TASKS_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.TASKS_MANAGE)
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.service.setStatus(user, id, dto);
  }
}
