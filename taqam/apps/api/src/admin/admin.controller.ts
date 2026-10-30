import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAdmin, Roles } from '../common/decorators';
import { PlatformUser } from '../common/types';
import {
  ActivateDto,
  BroadcastDto,
  CompaniesQuery,
  CreateAdminDto,
  DeleteCompanyDto,
  EventsQuery,
  ExtendDto,
  LeadsQuery,
  SuspendDto,
  UpdateAdminDto,
  UpdateCompanyAdminDto,
  UpdateLeadDto,
  UpdateSettingsDto,
} from './admin.dto';
import { AdminService } from './admin.service';
import { BillingService } from '../billing/billing.service';
import { CreateInvoiceDto, CreditInvoiceDto, EmailsQuery, InvoicesQuery, PayInvoiceDto, RemindDto } from '../billing/billing.dto';

/** Platform admin portal (SUPER_ADMIN only) — docs/ADMIN_PORTAL.md. */
@ApiBearerAuth()
@Roles('SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly billing: BillingService,
  ) {}

  @ApiTags('admin · overview')
  @ApiOperation({ summary: 'Platform KPIs: companies by status, MRR/ARR, signups, expiring soon, new leads' })
  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  // ---------- companies ----------
  @ApiTags('admin · companies')
  @Get('companies')
  companies(@Query() q: CompaniesQuery) {
    return this.admin.list(q);
  }

  @ApiTags('admin · companies')
  @Get('companies/:id')
  company(@Param('id') id: string) {
    return this.admin.detail(id);
  }

  @ApiTags('admin · companies')
  @HttpCode(200)
  @Post('companies/:id/activate')
  activate(@CurrentAdmin() a: PlatformUser, @Param('id') id: string, @Body() dto: ActivateDto) {
    return this.admin.activate(a, id, dto);
  }

  @ApiTags('admin · companies')
  @HttpCode(200)
  @Post('companies/:id/suspend')
  suspend(@CurrentAdmin() a: PlatformUser, @Param('id') id: string, @Body() dto: SuspendDto) {
    return this.admin.suspend(a, id, dto);
  }

  @ApiTags('admin · companies')
  @HttpCode(200)
  @Post('companies/:id/reactivate')
  reactivate(@CurrentAdmin() a: PlatformUser, @Param('id') id: string) {
    return this.admin.reactivate(a, id);
  }

  @ApiTags('admin · companies')
  @Patch('companies/:id')
  update(@CurrentAdmin() a: PlatformUser, @Param('id') id: string, @Body() dto: UpdateCompanyAdminDto) {
    return this.admin.update(a, id, dto);
  }

  @ApiTags('admin · companies')
  @HttpCode(200)
  @Post('companies/:id/extend')
  extend(@CurrentAdmin() a: PlatformUser, @Param('id') id: string, @Body() dto: ExtendDto) {
    return this.admin.extend(a, id, dto);
  }

  @ApiTags('admin · companies')
  @ApiOperation({ summary: 'AuthResponse for the company OWNER (1h token with impersonatedBy)' })
  @HttpCode(200)
  @Post('companies/:id/impersonate')
  impersonate(@CurrentAdmin() a: PlatformUser, @Param('id') id: string) {
    return this.admin.impersonate(a, id);
  }

  @ApiTags('admin · companies')
  @HttpCode(200)
  @Post('companies/:id/users/:userId/reset-password')
  resetPassword(@CurrentAdmin() a: PlatformUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.admin.resetPassword(a, id, userId);
  }

  @ApiTags('admin · companies')
  @ApiOperation({ summary: 'Hard delete the company and all tenant data (confirmName must equal nameAr); 409 when it has invoices' })
  @Delete('companies/:id')
  remove(@CurrentAdmin() a: PlatformUser, @Param('id') id: string, @Body() dto: DeleteCompanyDto, @Query('confirmName') confirmName?: string) {
    return this.admin.remove(a, id, dto, confirmName);
  }

  // ---------- leads ----------
  @ApiTags('admin · leads')
  @Get('leads')
  leads(@Query() q: LeadsQuery) {
    return this.admin.leads(q);
  }

  @ApiTags('admin · leads')
  @Patch('leads/:id')
  updateLead(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.admin.updateLead(id, dto);
  }

  // ---------- activity ----------
  @ApiTags('admin · activity')
  @Get('events')
  events(@Query() q: EventsQuery) {
    return this.admin.events(q);
  }

  // ---------- platform admins ----------
  @ApiTags('admin · settings')
  @Get('admins')
  admins() {
    return this.admin.admins();
  }

  @ApiTags('admin · settings')
  @Post('admins')
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.admin.createAdmin(dto);
  }

  @ApiTags('admin · settings')
  @Patch('admins/:id')
  updateAdmin(@CurrentAdmin() a: PlatformUser, @Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.admin.updateAdmin(a, id, dto);
  }

  // ---------- settings ----------
  @ApiTags('admin · settings')
  @Get('settings')
  settings() {
    return this.admin.settings();
  }

  @ApiTags('admin · settings')
  @Patch('settings')
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.admin.updateSettings(dto);
  }

  // ---------- broadcast ----------
  @ApiTags('admin · broadcast')
  @HttpCode(200)
  @Post('broadcast')
  broadcast(@Body() dto: BroadcastDto) {
    return this.admin.broadcast(dto);
  }

  // ---------- billing (v2) ----------
  @ApiTags('admin · billing')
  @ApiOperation({ summary: 'Invoices (paginated) + platform-wide summary tiles' })
  @Get('invoices')
  invoices(@Query() q: InvoicesQuery) {
    return this.billing.list(q);
  }

  @ApiTags('admin · billing')
  @ApiOperation({ summary: 'Printable document: Invoice (with seller/buyer snapshots, qr) & { company }' })
  @Get('invoices/:id')
  invoice(@Param('id') id: string) {
    return this.billing.detail(id);
  }

  @ApiTags('admin · billing')
  @ApiOperation({ summary: 'Issue an invoice (defaults: next period, active employees, effective price, company cycle)' })
  @Post('companies/:id/invoices')
  createInvoice(@CurrentAdmin() a: PlatformUser, @Param('id') id: string, @Body() dto: CreateInvoiceDto) {
    return this.billing.create(a, id, dto);
  }

  @ApiTags('admin · billing')
  @ApiOperation({ summary: 'Record payment (ISSUED → PAID, extends the subscription)' })
  @HttpCode(200)
  @Post('invoices/:id/pay')
  payInvoice(@CurrentAdmin() a: PlatformUser, @Param('id') id: string, @Body() dto: PayInvoiceDto) {
    return this.billing.pay(a, id, dto);
  }

  @ApiTags('admin · billing')
  @ApiOperation({ summary: 'Issue a credit note (SHC-…) against an ISSUED or PAID invoice; the invoice becomes CREDITED' })
  @Post('invoices/:id/credit')
  creditInvoice(@CurrentAdmin() a: PlatformUser, @Param('id') id: string, @Body() dto: CreditInvoiceDto) {
    return this.billing.credit(a, id, dto);
  }

  @ApiTags('admin · billing')
  @ApiOperation({ summary: 'Email log / outbox, newest first' })
  @Get('emails')
  emails(@Query() q: EmailsQuery) {
    return this.billing.emails(q);
  }

  @ApiTags('admin · billing')
  @ApiOperation({ summary: 'Send a manual reminder to the company owner' })
  @Post('companies/:id/remind')
  remind(@CurrentAdmin() a: PlatformUser, @Param('id') id: string, @Body() dto: RemindDto) {
    return this.billing.remind(a, id, dto);
  }

  @ApiTags('admin · billing')
  @ApiOperation({ summary: 'Run the subscription reminder job now' })
  @HttpCode(200)
  @Post('reminders/run')
  runReminders() {
    return this.billing.runReminders();
  }
}
