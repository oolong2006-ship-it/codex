import { Controller, Get, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { APP_CONFIG, AppConfig } from './config';
import { DbService } from './db/db.service';
import { ApiExceptionFilter } from './common/errors';
import { AuditInterceptor } from './common/audit.interceptor';
import { AuditService } from './common/audit.service';
import { AuthedRequest, Public } from './common/principal';
import { TenantChecks } from './common/tenant-checks';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthGuard, PermissionGuard } from './auth/guards';
import { AttestationAdapter, createAttestationAdapter } from './devices/attestation';
import { DevicesController } from './devices/devices.controller';
import { DevicesService } from './devices/devices.service';
import { OrgController, OrgService } from './org/org.controller';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { RecordsController } from './attendance/records.controller';
import { SessionsService } from './attendance/sessions.service';
import { ExceptionsService } from './attendance/exceptions.service';
import { SitesController, SitesService } from './sites/sites.module';
import { PoliciesService } from './common/policies.service';
import { PlatformController, PlatformService } from './platform/platform.controller';

@ApiTags('health')
@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { status: 'ok' };
  }
}

export function buildAppModule(config: AppConfig) {
  @Module({
    controllers: [HealthController, AuthController, DevicesController, OrgController, PlatformController, SitesController, AttendanceController, RecordsController],
    providers: [
      { provide: APP_CONFIG, useValue: config },
      { provide: AttestationAdapter, useFactory: () => createAttestationAdapter(config) },
      DbService,
      AuditService,
      TenantChecks,
      AuthService,
      DevicesService,
      OrgService,
      PlatformService,
      PoliciesService,
      SitesService,
      AttendanceService,
      SessionsService,
      ExceptionsService,
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_GUARD, useClass: PermissionGuard },
      { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
    ],
  })
  class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer
        .apply((req: AuthedRequest, res: Response, next: NextFunction) => {
          const incoming = req.get('x-request-id');
          req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
          res.setHeader('x-request-id', req.requestId);
          next();
        })
        .forRoutes('*');
    }
  }
  return AppModule;
}
