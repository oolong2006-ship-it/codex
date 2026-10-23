import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './auth/guards';
import { SerializeInterceptor } from './common/serialize';
import { PublicModule } from './public/public.module';
import { SettingsModule } from './settings/settings.module';
import { OrgModule } from './org/org.module';
import { EmployeesModule } from './employees/employees.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeavesModule } from './leaves/leaves.module';
import { RequestsModule } from './requests/requests.module';
import { PayrollModule } from './payroll/payroll.module';
import { SaudizationModule } from './saudization/saudization.controller';
import { PerformanceModule } from './performance/performance.controller';
import { RecruitmentModule } from './recruitment/recruitment.controller';
import { CommsModule } from './comms/comms.controller';
import { ReportsModule } from './reports/reports.controller';
import { DashboardModule } from './dashboard/dashboard.controller';
import { MeModule } from './me/me.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL ?? 60) * 1000,
        limit: Number(process.env.RATE_LIMIT_MAX ?? 600),
      },
    ]),
    PrismaModule,
    SharedModule,
    AuthModule,
    PublicModule,
    SettingsModule,
    OrgModule,
    EmployeesModule,
    AttendanceModule,
    LeavesModule,
    RequestsModule,
    PayrollModule,
    SaudizationModule,
    PerformanceModule,
    RecruitmentModule,
    CommsModule,
    ReportsModule,
    DashboardModule,
    MeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: SerializeInterceptor },
  ],
})
export class AppModule {}
