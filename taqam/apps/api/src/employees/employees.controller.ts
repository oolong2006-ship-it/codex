import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ADMIN, CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';
import { CreateEmployeeDto, DocumentDto, EosbQueryDto, QiwaDocumentedDto, TerminateDto, UpdateEmployeeDto } from './employees.dto';
import { EmployeeQuery, EmployeesService } from './employees.service';

@ApiTags('employees')
@ApiBearerAuth()
@Controller()
export class EmployeesController {
  constructor(private readonly svc: EmployeesService) {}

  @Roles(...STAFF)
  @Get('employees')
  list(@CurrentUser() u: AuthUser, @Query() q: EmployeeQuery) {
    return this.svc.list(u, q);
  }

  @Roles(...STAFF)
  @Get('employees/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.detail(u, id);
  }

  @Roles(...ADMIN)
  @Post('employees')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.svc.create(u, dto);
  }

  /** Confirm (or undo) that contracts are documented in Qiwa — since 15 Apr 2026 only documented Saudis count for Nitaqat. */
  @Roles(...ADMIN)
  @Post('employees/qiwa-documented')
  qiwaDocumented(@CurrentUser() u: AuthUser, @Body() dto: QiwaDocumentedDto) {
    return this.svc.setQiwaDocumented(u, dto);
  }

  @Roles(...ADMIN)
  @Patch('employees/:id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.svc.update(u, id, dto);
  }

  @Roles(...ADMIN)
  @Post('employees/:id/terminate')
  terminate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: TerminateDto) {
    return this.svc.terminate(u, id, dto);
  }

  @Roles('OWNER', 'HR_ADMIN', 'PAYROLL')
  @Get('employees/:id/eosb')
  eosb(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query() q: EosbQueryDto) {
    return this.svc.eosb(u, id, q.endDate, q.reason);
  }

  @Roles(...STAFF)
  @Get('employees/:id/documents')
  documents(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.documents(u, id);
  }

  @Roles(...ADMIN)
  @Post('employees/:id/documents')
  addDocument(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DocumentDto) {
    return this.svc.addDocument(u, id, dto);
  }

  @Roles(...ADMIN)
  @Delete('employees/:id/documents/:docId')
  deleteDocument(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('docId') docId: string) {
    return this.svc.deleteDocument(u, id, docId);
  }

  @Roles(...STAFF)
  @Get('documents/expiring')
  expiring(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    return this.svc.expiring(u, Number(days) || 90);
  }

  @Roles(...STAFF)
  @Get('org-chart')
  orgChart(@CurrentUser() u: AuthUser) {
    return this.svc.orgChart(u);
  }
}
