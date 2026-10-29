import { Body, Controller, Get, Injectable, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { hash } from '@node-rs/argon2';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { AuditMeta, AuditService, auditMeta } from '../common/audit.service';
import { Audited } from '../common/audit.interceptor';
import { conflict, forbidden } from '../common/errors';
import { AuthedRequest, CurrentPrincipal, Principal, RequirePermission } from '../common/principal';
import { DbService } from '../db/db.service';
import { randomToken } from '../auth/crypto';
import { insertDefaultPolicies } from '../common/tenant-bootstrap';

class CreateTenantDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'acme-restaurants' }) @Matches(/^[a-z0-9][a-z0-9-]{1,62}$/)
  slug!: string;

  @ApiProperty({ description: 'بريد مسؤول العميل الأول' }) @IsEmail()
  admin_email!: string;
}

/** عمليات Super Admin (دور sa_platform). الفوترة مؤجلة؛ العميل يُنشأ يدويًا. */
@Injectable()
export class PlatformService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async createTenant(dto: CreateTenantDto, meta: AuditMeta) {
    return this.db.platformTx(async (tx) => {
      if ((await tx.query('SELECT 1 FROM tenants WHERE slug = $1', [dto.slug])).rowCount) throw conflict('VALIDATION_FAILED');
      const tenant = (
        await tx.query('INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id, name, slug, status, created_at', [dto.name, dto.slug])
      ).rows[0];
      await tx.query('INSERT INTO tenant_settings (tenant_id) VALUES ($1)', [tenant.id]);
      await insertDefaultPolicies(tx, tenant.id);
      // كلمة مرور مؤقتة عشوائية؛ قناة الدعوة (بريد) خارج نطاق المرحلة 1.
      const temporaryPassword = randomToken(18);
      const admin = (
        await tx.query(
          'INSERT INTO user_accounts (tenant_id, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
          [tenant.id, dto.admin_email, await hash(temporaryPassword)],
        )
      ).rows[0];
      await tx.query("INSERT INTO user_role_assignments (tenant_id, user_id, role_code) VALUES ($1, $2, 'tenant_admin')", [tenant.id, admin.id]);
      await this.audit.record(tx, meta, { action: 'platform.tenant.created', entityType: 'tenant', entityId: tenant.id, after: tenant });
      return { tenant, admin_user_id: admin.id, temporary_password: temporaryPassword };
    });
  }

  listTenants() {
    return this.db.platformTx(async (tx) => (await tx.query('SELECT id, name, slug, status, created_at FROM tenants ORDER BY created_at')).rows);
  }
}

@ApiTags('platform')
@ApiBearerAuth()
@Controller('v1/platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Post('tenants')
  @RequirePermission('tenants.manage')
  @Audited('platform.tenant.create', 'tenant')
  @ApiOperation({ summary: 'إنشاء عميل يدويًا مع مسؤول أول وسياسة أجهزة افتراضية.' })
  create(@CurrentPrincipal() p: Principal, @Body() body: CreateTenantDto, @Req() req: AuthedRequest) {
    if (p.tenantId) throw forbidden();
    return this.platform.createTenant(body, auditMeta(req, p));
  }

  @Get('tenants')
  @RequirePermission('tenants.manage')
  @ApiOperation({ summary: 'قائمة العملاء.' })
  list(@CurrentPrincipal() p: Principal) {
    if (p.tenantId) throw forbidden();
    return this.platform.listTenants();
  }
}
