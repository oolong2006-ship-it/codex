import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthModule } from './health/health.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { VenuesModule } from './venues/venues.module';
import { ZonesModule } from './zones/zones.module';
import { GatesModule } from './gates/gates.module';
import { EventsModule } from './events/events.module';
import { CrowdModule } from './crowd/crowd.module';
import { QueuesModule } from './queues/queues.module';
import { AlertsModule } from './alerts/alerts.module';
import { IncidentsModule } from './incidents/incidents.module';
import { TasksModule } from './tasks/tasks.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SimulatorModule } from './simulator/simulator.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL ?? 60) * 1000,
        limit: Number(process.env.RATE_LIMIT_MAX ?? 120),
      },
    ]),
    PrismaModule,
    AuthModule,
    RealtimeModule,
    HealthModule,
    OrganizationsModule,
    UsersModule,
    VenuesModule,
    ZonesModule,
    GatesModule,
    EventsModule,
    CrowdModule,
    QueuesModule,
    AlertsModule,
    IncidentsModule,
    TasksModule,
    DashboardModule,
    SimulatorModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
