import { Module } from '@nestjs/common';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { CrowdModule } from '../crowd/crowd.module';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [CrowdModule, QueuesModule],
  controllers: [CopilotController],
  providers: [CopilotService],
})
export class CopilotModule {}
