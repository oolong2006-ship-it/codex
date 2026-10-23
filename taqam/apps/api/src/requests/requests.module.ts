import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({ imports: [AttendanceModule], controllers: [RequestsController], providers: [RequestsService], exports: [RequestsService] })
export class RequestsModule {}
