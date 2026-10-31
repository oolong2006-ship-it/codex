import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';
import { ComplianceService } from './compliance.service';

/**
 * Compliance center (spec §5) — read-only. OWNER/HR_ADMIN/PAYROLL see the company; a BRANCH_MANAGER
 * is limited to their branch (ScopeService) and gets no WPS status.
 */
@ApiTags('compliance')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  /** `{ risk, saudization, wps: { prevPeriod, due, exported, exportedAt, latestRunId, latestRunPeriod, errors } | null, documents }` */
  @Get('overview')
  overview(@CurrentUser() u: AuthUser) {
    return this.svc.overview(u);
  }

  /** `{ period, estimated, runId, fees, branches: (BranchLaborCost & { branchName })[], totals }` */
  @ApiQuery({ name: 'period', required: false, example: '2026-10' })
  @Get('branch-costs')
  branchCosts(@CurrentUser() u: AuthUser, @Query('period') period?: string) {
    return this.svc.branchCosts(u, period);
  }
}
