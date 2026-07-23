import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { CrowdModule } from '../crowd/crowd.module';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [CrowdModule, QueuesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
