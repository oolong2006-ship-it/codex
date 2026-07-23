import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GatesService } from './gates.service';
import { CreateGateDto, UpdateGateDto, UpdateGateStatusDto } from './gates.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/rbac';
import { AuthenticatedUser } from '../common/types';

@ApiTags('gates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('gates')
export class GatesController {
  constructor(private readonly service: GatesService) {}

  @Get()
  @ApiQuery({ name: 'venueId', required: false })
  @RequirePermissions(PERMISSIONS.GATES_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('venueId') venueId?: string) {
    return this.service.findAll(user, venueId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.GATES_READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.GATES_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGateDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.GATES_MANAGE)
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateGateStatusDto,
  ) {
    return this.service.setStatus(user, id, dto.status);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.GATES_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateGateDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.GATES_MANAGE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
