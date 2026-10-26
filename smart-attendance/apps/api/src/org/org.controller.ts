import { Controller, Get, Injectable, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DbService } from '../db/db.service';
import { forbidden } from '../common/errors';
import { CurrentPrincipal, Principal, RequirePermission, branchScope } from '../common/principal';
import { TenantChecks } from '../common/tenant-checks';

const EMPLOYEE_COLUMNS = 'id, tenant_id, employee_number, full_name, branch_id, department_id, status';

/** قراءة الموظفين والفروع (واجهات المرحلة 1 لإثبات العزل وABAC؛ الإدارة الكاملة في المرحلة 2). */
@Injectable()
export class OrgService {
  constructor(
    private readonly db: DbService,
    private readonly checks: TenantChecks,
  ) {}

  private tenantOf(p: Principal): string {
    if (!p.tenantId) throw forbidden();
    return p.tenantId;
  }

  listEmployees(p: Principal) {
    const scope = branchScope(p);
    return this.db.tenantTx(this.tenantOf(p), async (tx) =>
      (
        await tx.query(
          `SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE ($1::uuid[] IS NULL OR branch_id = ANY($1)) ORDER BY employee_number LIMIT 1000`,
          [scope],
        )
      ).rows,
    );
  }

  getEmployee(p: Principal, id: string) {
    return this.db.tenantTx(this.tenantOf(p), async (tx) => {
      const row = (await tx.query(`SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = $1`, [id])).rows[0];
      this.checks.assertOwned(p, row);
      this.checks.assertBranchInScope(branchScope(p), row.branch_id);
      return row;
    });
  }

  listBranches(p: Principal) {
    const scope = branchScope(p);
    return this.db.tenantTx(this.tenantOf(p), async (tx) =>
      (
        await tx.query(
          'SELECT id, tenant_id, name, code, status FROM branches WHERE ($1::uuid[] IS NULL OR id = ANY($1)) ORDER BY code',
          [scope],
        )
      ).rows,
    );
  }
}

@ApiTags('org')
@ApiBearerAuth()
@Controller('v1')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('me')
  @ApiOperation({ summary: 'هوية المستخدم الحالي وأدواره وصلاحياته.' })
  me(@CurrentPrincipal() p: Principal) {
    return p;
  }

  @Get('employees')
  @RequirePermission('employees.read')
  @ApiOperation({ summary: 'الموظفون (مدير الفرع: فروعه فقط).' })
  listEmployees(@CurrentPrincipal() p: Principal) {
    return this.org.listEmployees(p);
  }

  @Get('employees/:id')
  @RequirePermission('employees.read')
  @ApiOperation({ summary: 'موظف واحد. خارج العميل أو النطاق = 404.' })
  getEmployee(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.org.getEmployee(p, id);
  }

  @Get('branches')
  @RequirePermission('branches.read')
  @ApiOperation({ summary: 'الفروع (مدير الفرع: فروعه فقط).' })
  listBranches(@CurrentPrincipal() p: Principal) {
    return this.org.listBranches(p);
  }
}
