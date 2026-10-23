import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';
import { ManualAttendanceDto, RosterDto, ShiftDto, UpdateAttendanceDto, UpdateShiftDto } from './attendance.dto';
import { AttendanceService } from './attendance.service';

const MANAGERS = ['OWNER', 'HR_ADMIN', 'BRANCH_MANAGER'] as const;

@ApiTags('attendance')
@ApiBearerAuth()
@Controller()
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Roles(...STAFF)
  @Get('shifts')
  shifts(@CurrentUser() u: AuthUser, @Query('branchId') branchId?: string) {
    return this.svc.shifts(u, branchId);
  }

  @Roles(...MANAGERS)
  @Post('shifts')
  createShift(@CurrentUser() u: AuthUser, @Body() dto: ShiftDto) {
    return this.svc.createShift(u, dto);
  }

  @Roles(...MANAGERS)
  @Patch('shifts/:id')
  updateShift(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.svc.updateShift(u, id, dto);
  }

  @Roles(...MANAGERS)
  @Delete('shifts/:id')
  deleteShift(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.deleteShift(u, id);
  }

  @Roles(...STAFF)
  @Get('roster')
  roster(@CurrentUser() u: AuthUser, @Query('branchId') branchId?: string, @Query('weekStart') weekStart?: string) {
    return this.svc.roster(u, branchId, weekStart);
  }

  @Roles(...MANAGERS)
  @Put('roster')
  putRoster(@CurrentUser() u: AuthUser, @Body() dto: RosterDto) {
    return this.svc.putRoster(u, dto);
  }

  @Roles(...STAFF)
  @Get('attendance')
  board(@CurrentUser() u: AuthUser, @Query('date') date?: string, @Query('branchId') branchId?: string) {
    return this.svc.board(u, date, branchId);
  }

  @Roles(...STAFF)
  @Get('attendance/summary')
  summary(@CurrentUser() u: AuthUser, @Query() q: { from?: string; to?: string; branchId?: string; employeeId?: string }) {
    return this.svc.summary(u, q);
  }

  @Roles(...MANAGERS)
  @Post('attendance/manual')
  manual(@CurrentUser() u: AuthUser, @Body() dto: ManualAttendanceDto) {
    return this.svc.manual(u, dto);
  }

  @Roles(...MANAGERS)
  @Patch('attendance/:id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateAttendanceDto) {
    return this.svc.update(u, id, dto);
  }
}
