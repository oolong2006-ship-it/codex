import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { OwnerInvoicesQuery } from './billing.dto';
import { BillingService } from './billing.service';

/** Company owner: own subscription & invoices (docs/ADMIN_PORTAL.md v2). */
@ApiTags('billing')
@ApiBearerAuth()
@Roles('OWNER')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @ApiOperation({ summary: 'Own subscription: status, plan, price, seats, end dates, days left' })
  @Get('subscription')
  subscription(@CurrentUser() u: AuthUser) {
    return this.billing.subscription(u.companyId);
  }

  @ApiOperation({ summary: 'Own invoices (VOID included), newest first' })
  @Get('invoices')
  invoices(@CurrentUser() u: AuthUser, @Query() q: OwnerInvoicesQuery) {
    return this.billing.ownerInvoices(u.companyId, q);
  }

  @ApiOperation({ summary: 'Printable tax invoice (own company only)' })
  @Get('invoices/:id')
  invoice(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.billing.ownerInvoice(u.companyId, id);
  }
}
