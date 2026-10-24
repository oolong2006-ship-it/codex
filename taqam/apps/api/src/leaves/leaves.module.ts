import { Module } from '@nestjs/common';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';
import { LeaveStatusJob } from './leave-status.job';

@Module({ controllers: [LeavesController], providers: [LeavesService, LeaveStatusJob], exports: [LeavesService, LeaveStatusJob] })
export class LeavesModule {}
