import { Body, Controller, Get, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DatabaseError } from 'pg';
import { DbService, Tx } from '../db/db.service';
import { AuditMeta, AuditService, auditMeta } from '../common/audit.service';
import { Audited } from '../common/audit.interceptor';
import { badRequest, forbidden } from '../common/errors';
import { AuthedRequest, CurrentPrincipal, Principal, RequirePermission, branchScope } from '../common/principal';
import { TenantChecks } from '../common/tenant-checks';

class LatLngDto {
  @ApiProperty() @IsLatitude()
  lat!: number;

  @ApiProperty() @IsLongitude()
  lng!: number;
}

class GeofenceDto {
  @ApiProperty({ enum: ['CIRCLE', 'POLYGON'] }) @IsIn(['CIRCLE', 'POLYGON'])
  kind!: 'CIRCLE' | 'POLYGON';

  @ApiPropertyOptional({ type: LatLngDto }) @IsOptional() @ValidateNested() @Type(() => LatLngDto)
  center?: LatLngDto;

  @ApiPropertyOptional({ description: 'نصف القطر بالأمتار' }) @IsOptional() @IsNumber() @IsPositive() @Max(5000)
  radius_m?: number;

  @ApiPropertyOptional({ type: [LatLngDto], description: 'رؤوس المضلع (يُغلق تلقائيًا)' })
  @IsOptional() @ArrayMinSize(3) @ValidateNested({ each: true }) @Type(() => LatLngDto)
  polygon?: LatLngDto[];

  @ApiPropertyOptional({ description: 'هامش السماح t بالأمتار (specs §B)', default: 0 })
  @IsOptional() @IsNumber() @Min(0) @Max(500)
  tolerance_m?: number;
}

class CreateWorkLocationDto {
  @ApiProperty() @IsUUID()
  branch_id!: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ enum: ['STANDARD', 'HIGH', 'STRICT'] }) @IsOptional() @IsIn(['STANDARD', 'HIGH', 'STRICT'])
  assurance_level?: 'STANDARD' | 'HIGH' | 'STRICT';

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  wifi_uplift_enabled?: boolean;

  @ApiProperty({ type: GeofenceDto }) @ValidateNested() @Type(() => GeofenceDto)
  geofence!: GeofenceDto;
}

class AssignSiteDto {
  @ApiProperty() @IsUUID()
  work_location_id!: string;

  @ApiPropertyOptional() @IsOptional() @IsISO8601()
  valid_from?: string;

  @ApiPropertyOptional() @IsOptional() @IsISO8601()
  valid_to?: string;
}

/** WKT للمضلع بترتيب (lng lat) مع إغلاق الحلقة. */
export function polygonWkt(points: { lat: number; lng: number }[]): string {
  const ring = [...points];
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first.lat !== last.lat || first.lng !== last.lng) ring.push(first);
  return `SRID=4326;POLYGON((${ring.map((p) => `${p.lng} ${p.lat}`).join(', ')}))`;
}

@Injectable()
export class SitesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly checks: TenantChecks,
  ) {}

  private tenantOf(p: Principal): string {
    if (!p.tenantId) throw forbidden();
    return p.tenantId;
  }

  private async insertVersion(tx: Tx, p: Principal, geofenceId: string, g: GeofenceDto) {
    if (g.kind === 'CIRCLE' && (!g.center || !g.radius_m)) throw badRequest('VALIDATION_FAILED', { field: 'geofence' });
    if (g.kind === 'POLYGON' && !g.polygon) throw badRequest('VALIDATION_FAILED', { field: 'geofence.polygon' });
    const next = (
      await tx.query('SELECT coalesce(max(version), 0) + 1 AS v FROM geofence_versions WHERE geofence_id = $1', [geofenceId])
    ).rows[0].v;
    try {
      const row = (
        await tx.query(
          `INSERT INTO geofence_versions (tenant_id, geofence_id, version, kind, center, radius_m, polygon, tolerance_m, created_by)
           VALUES ($1, $2, $3, $4,
             CASE WHEN $4 = 'CIRCLE' THEN ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography END,
             $7, CASE WHEN $4 = 'POLYGON' THEN ST_GeogFromText($8) END, $9, $10)
           RETURNING id, version, kind, radius_m, tolerance_m, created_at`,
          [
            p.tenantId, geofenceId, next, g.kind,
            g.center?.lng ?? null, g.center?.lat ?? null,
            g.kind === 'CIRCLE' ? g.radius_m : null,
            g.kind === 'POLYGON' ? polygonWkt(g.polygon!) : null,
            g.tolerance_m ?? 0, p.userId,
          ],
        )
      ).rows[0];
      await tx.query('UPDATE geofences SET current_version_id = $2 WHERE id = $1', [geofenceId, row.id]);
      return row;
    } catch (err) {
      // T-03b: مضلع ذاتي التقاطع أو هندسة غير صالحة.
      if (err instanceof DatabaseError && (err.code === '23514' || err.code === 'XX000')) {
        throw badRequest('VALIDATION_FAILED', { field: 'geofence', reason: 'invalid geometry' });
      }
      throw err;
    }
  }

  async create(p: Principal, dto: CreateWorkLocationDto, meta: AuditMeta) {
    return this.db.tenantTx(this.tenantOf(p), async (tx) => {
      const branch = (await tx.query('SELECT id, tenant_id FROM branches WHERE id = $1', [dto.branch_id])).rows[0];
      this.checks.assertOwned(p, branch);
      const loc = (
        await tx.query(
          `INSERT INTO work_locations (tenant_id, branch_id, name, code, assurance_level, wifi_uplift_enabled)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, branch_id, name, code, assurance_level, wifi_uplift_enabled, status`,
          [p.tenantId, dto.branch_id, dto.name, dto.code ?? null, dto.assurance_level ?? 'STANDARD', dto.wifi_uplift_enabled ?? false],
        )
      ).rows[0];
      const gf = (await tx.query('INSERT INTO geofences (tenant_id, work_location_id) VALUES ($1, $2) RETURNING id', [p.tenantId, loc.id])).rows[0];
      const version = await this.insertVersion(tx, p, gf.id, dto.geofence);
      const out = { ...loc, geofence: { id: gf.id, current_version: version } };
      await this.audit.record(tx, meta, { action: 'site.created', entityType: 'work_location', entityId: loc.id, after: out });
      return out;
    });
  }

  async newGeofenceVersion(p: Principal, locationId: string, g: GeofenceDto, meta: AuditMeta) {
    return this.db.tenantTx(this.tenantOf(p), async (tx) => {
      const gf = (
        await tx.query('SELECT g.id, g.tenant_id, g.current_version_id FROM geofences g WHERE g.work_location_id = $1 FOR UPDATE', [locationId])
      ).rows[0];
      this.checks.assertOwned(p, gf);
      const version = await this.insertVersion(tx, p, gf.id, g);
      await this.audit.record(tx, meta, {
        action: 'site.geofence.versioned',
        entityType: 'work_location',
        entityId: locationId,
        before: { geofence_version_id: gf.current_version_id },
        after: { geofence_version_id: version.id, version: version.version },
      });
      return version;
    });
  }

  list(p: Principal) {
    const scope = branchScope(p);
    return this.db.tenantTx(this.tenantOf(p), async (tx) =>
      (
        await tx.query(
          `SELECT w.id, w.branch_id, w.name, w.code, w.assurance_level, w.wifi_uplift_enabled, w.status,
                  v.id AS geofence_version_id, v.version, v.kind, v.radius_m, v.tolerance_m,
                  ST_Y(v.center::geometry) AS center_lat, ST_X(v.center::geometry) AS center_lng,
                  ST_AsGeoJSON(v.polygon)::jsonb AS polygon
           FROM work_locations w JOIN geofences g ON g.work_location_id = w.id
           JOIN geofence_versions v ON v.id = g.current_version_id
           WHERE ($1::uuid[] IS NULL OR w.branch_id = ANY($1)) ORDER BY w.name`,
          [scope],
        )
      ).rows,
    );
  }

  async assign(p: Principal, employeeId: string, dto: AssignSiteDto, meta: AuditMeta) {
    return this.db.tenantTx(this.tenantOf(p), async (tx) => {
      const emp = (await tx.query('SELECT id, tenant_id FROM employees WHERE id = $1', [employeeId])).rows[0];
      this.checks.assertOwned(p, emp);
      const loc = (await tx.query('SELECT id, tenant_id FROM work_locations WHERE id = $1', [dto.work_location_id])).rows[0];
      this.checks.assertOwned(p, loc);
      const row = (
        await tx.query(
          `INSERT INTO employee_site_assignments (tenant_id, employee_id, work_location_id, valid_from, valid_to, created_by)
           VALUES ($1, $2, $3, coalesce($4::timestamptz, now()), $5, $6) RETURNING *`,
          [p.tenantId, employeeId, dto.work_location_id, dto.valid_from ?? null, dto.valid_to ?? null, p.userId],
        )
      ).rows[0];
      await this.audit.record(tx, meta, { action: 'site.assignment.created', entityType: 'employee_site_assignment', entityId: row.id, after: row });
      return row;
    });
  }
}

@ApiTags('sites')
@ApiBearerAuth()
@ApiExtraModels(LatLngDto)
@Controller('v1')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Post('work-locations')
  @RequirePermission('branches.write')
  @Audited('site.create', 'work_location')
  @ApiOperation({ summary: 'موقع عمل بسياج دائري أو مضلع (النسخة 1).' })
  create(@CurrentPrincipal() p: Principal, @Body() body: CreateWorkLocationDto, @Req() req: AuthedRequest) {
    return this.sites.create(p, body, auditMeta(req, p));
  }

  @Get('work-locations')
  @RequirePermission('branches.read')
  @ApiOperation({ summary: 'مواقع العمل مع نسخة السياج الحالية (مدير الفرع: فروعه).' })
  list(@CurrentPrincipal() p: Principal) {
    return this.sites.list(p);
  }

  @Post('work-locations/:id/geofence-versions')
  @RequirePermission('branches.write')
  @Audited('site.geofence.version', 'work_location')
  @ApiOperation({ summary: 'تعديل السياج = نسخة جديدة؛ الأحداث القديمة تبقى على نسختها.' })
  version(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: GeofenceDto, @Req() req: AuthedRequest) {
    return this.sites.newGeofenceVersion(p, id, body, auditMeta(req, p));
  }

  @Post('employees/:id/site-assignments')
  @RequirePermission('sites.assign')
  @Audited('site.assignment.create', 'employee_site_assignment')
  @ApiOperation({ summary: 'تفويض موظف بموقع عمل.' })
  assign(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() body: AssignSiteDto, @Req() req: AuthedRequest) {
    return this.sites.assign(p, id, body, auditMeta(req, p));
  }
}
