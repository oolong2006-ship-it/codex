import { Global, Module } from '@nestjs/common';
import { PlatformService } from './platform.service';

@Global()
@Module({ providers: [PlatformService], exports: [PlatformService] })
export class PlatformModule {}
