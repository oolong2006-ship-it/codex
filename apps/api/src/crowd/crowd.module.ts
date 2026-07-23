import { Module } from '@nestjs/common';
import { CrowdController } from './crowd.controller';
import { CrowdService } from './crowd.service';

@Module({
  controllers: [CrowdController],
  providers: [CrowdService],
  exports: [CrowdService],
})
export class CrowdModule {}
