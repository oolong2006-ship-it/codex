import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { NotifyService } from './notifications.service';
import { ScopeService } from './scope.service';
import { LeaveCalcService } from './leave-calc.service';
import { AttendanceCalcService } from './attendance-calc.service';

@Global()
@Module({
  providers: [AuditService, NotifyService, ScopeService, LeaveCalcService, AttendanceCalcService],
  exports: [AuditService, NotifyService, ScopeService, LeaveCalcService, AttendanceCalcService],
})
export class SharedModule {}
