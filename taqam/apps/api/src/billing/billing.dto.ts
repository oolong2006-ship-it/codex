import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingCycle, EmailStatus, EmailType, InvoiceStatus, PaymentMethod } from '@prisma/client';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { CYCLES, PageQuery } from '../admin/admin.dto';

export const INVOICE_STATUSES: InvoiceStatus[] = ['ISSUED', 'PAID', 'VOID'];
export const PAYMENT_METHODS: PaymentMethod[] = ['BANK_TRANSFER', 'CARD', 'CASH', 'OTHER'];
export const EMAIL_TYPES: EmailType[] = ['TRIAL_ENDING', 'SUBSCRIPTION_ENDING', 'EXPIRED', 'INVOICE_ISSUED', 'PAYMENT_RECEIVED', 'INVOICE_OVERDUE', 'MANUAL_REMINDER'];
export const EMAIL_STATUSES: EmailStatus[] = ['SENT', 'FAILED', 'LOGGED'];

/** A real calendar day: YYYY-MM-DD with month 01–12 and day 01–31. */
export const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DAY_MSG = { message: 'must be a date YYYY-MM-DD' };

export class InvoicesQuery extends PageQuery {
  @ApiPropertyOptional({ enum: INVOICE_STATUSES }) @IsOptional() @IsIn(INVOICE_STATUSES) status?: InvoiceStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() companyId?: string;
  @ApiPropertyOptional({ description: 'invoice number or company name' }) @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: ['true', 'false'] }) @IsOptional() @IsIn(['true', 'false', true, false]) overdue?: string | boolean;
}

export class CreateInvoiceDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD; default = day after the latest non-void invoice, else today' })
  @IsOptional() @Matches(DAY_RE, DAY_MSG) periodStart?: string;
  @ApiPropertyOptional({ description: 'default = max(1, active employees)' }) @IsOptional() @IsInt() @Min(1) @Max(100000) employees?: number;
  @ApiPropertyOptional({ description: 'default = company effective price' }) @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @ApiPropertyOptional({ enum: CYCLES }) @IsOptional() @IsIn(CYCLES) billingCycle?: BillingCycle;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() sendEmail?: boolean;
}

export class PayInvoiceDto {
  @ApiProperty({ enum: PAYMENT_METHODS }) @IsIn(PAYMENT_METHODS) paymentMethod: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) paymentRef?: string;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD (default today)' }) @IsOptional() @Matches(DAY_RE, DAY_MSG) paidAt?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() extendSubscription?: boolean;
}

export class VoidInvoiceDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}

export class EmailsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: EMAIL_TYPES }) @IsOptional() @IsIn(EMAIL_TYPES) type?: EmailType;
  @ApiPropertyOptional({ enum: EMAIL_STATUSES }) @IsOptional() @IsIn(EMAIL_STATUSES) status?: EmailStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() companyId?: string;
}

export class RemindDto {
  @ApiPropertyOptional({ description: 'extra text added to the reminder' }) @IsOptional() @IsString() @MaxLength(2000) message?: string;
}

export class OwnerInvoicesQuery extends PageQuery {}
