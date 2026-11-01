import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({ controllers: [AttendanceController, DevicesController], providers: [AttendanceService, DevicesService], exports: [AttendanceService, DevicesService] })
export class AttendanceModule {}
