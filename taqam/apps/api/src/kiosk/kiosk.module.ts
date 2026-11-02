import { Module } from '@nestjs/common';
import { KioskAdminController, KioskController } from './kiosk.controller';
import { KioskGuard } from './kiosk.guard';
import { KioskService } from './kiosk.service';

@Module({ controllers: [KioskAdminController, KioskController], providers: [KioskService, KioskGuard], exports: [KioskService] })
export class KioskModule {}
