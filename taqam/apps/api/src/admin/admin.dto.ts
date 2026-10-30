import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingCycle, CompanyEventType, CompanyStatus, LeadStatus, Plan } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { cleanNameTransform, NAME_MAX } from '../common/text';

export const COMPANY_STATUSES: CompanyStatus[] = ['PENDING', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'];
export const PLAN_VALUES: Plan[] = ['ESSENTIALS', 'GROWTH', 'ENTERPRISE'];
export const CYCLES: BillingCycle[] = ['MONTHLY', 'ANNUAL'];
export const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'CONVERTED', 'LOST'];
export const EVENT_TYPES: CompanyEventType[] = [
  'REGISTERED', 'ACTIVATED', 'SUSPENDED', 'REACTIVATED', 'PLAN_CHANGED', 'EXTENDED', 'NOTE', 'IMPERSONATED', 'EXPIRED', 'DELETED',
  'INVOICE_ISSUED', 'INVOICE_PAID', 'INVOICE_VOIDED', 'REMINDER_SENT', 'INVOICE_CREDITED',
];
export const COMPANY_SORTS = ['createdAt', 'name', 'employees', 'lastActivityAt'] as const;

/** Decimal(10,2) ceiling for prices per employee. */
const MAX_PRICE = 99999999;

const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class PageQuery {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number;
}

const STATUS_LIST = new RegExp(`^(${COMPANY_STATUSES.join('|')})(,(${COMPANY_STATUSES.join('|')}))*$`);

export class CompaniesQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ description: 'One status or a comma-separated list', example: 'PENDING' })
  @IsOptional() @Matches(STATUS_LIST, { message: `status must be one of ${COMPANY_STATUSES.join(', ')}` }) status?: string;
  @ApiPropertyOptional({ enum: PLAN_VALUES }) @IsOptional() @IsIn(PLAN_VALUES) plan?: Plan;
  @ApiPropertyOptional({ enum: COMPANY_SORTS, description: 'prefix with - to force descending' })
  @IsOptional() @IsIn([...COMPANY_SORTS, ...COMPANY_SORTS.map((s) => `-${s}`)]) sort?: string;
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';
}

export class ActivateDto {
  @ApiProperty({ enum: PLAN_VALUES }) @IsOptional() @IsIn(PLAN_VALUES) plan?: Plan;
  @ApiProperty({ enum: CYCLES }) @IsOptional() @IsIn(CYCLES) billingCycle?: BillingCycle;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) maxEmployees?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_PRICE) pricePerEmployee?: number | null;
  @ApiProperty({ enum: ['TRIAL', 'PAID'] }) @IsIn(['TRIAL', 'PAID']) mode: 'TRIAL' | 'PAID';
  @ApiPropertyOptional({ default: 14 }) @IsOptional() @IsInt() @Min(1) @Max(365) trialDays?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() subscriptionEndsAt?: string | null;
}

export class SuspendDto {
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}

export class UpdateCompanyAdminDto {
  @ApiPropertyOptional({ enum: PLAN_VALUES }) @IsOptional() @IsIn(PLAN_VALUES) plan?: Plan;
  @ApiPropertyOptional({ enum: CYCLES }) @IsOptional() @IsIn(CYCLES) billingCycle?: BillingCycle;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) maxEmployees?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_PRICE) pricePerEmployee?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() trialEndsAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() subscriptionEndsAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() adminNotes?: string | null;
  @ApiPropertyOptional({ maxLength: NAME_MAX }) @IsOptional() @Transform(cleanNameTransform) @IsString() @MinLength(2) @MaxLength(NAME_MAX) nameAr?: string;
  @ApiPropertyOptional({ nullable: true, maxLength: NAME_MAX }) @IsOptional() @Transform(cleanNameTransform) @IsString() @MaxLength(NAME_MAX) nameEn?: string | null;
}

export class ExtendDto {
  @ApiProperty() @IsInt() @Min(1) @Max(3650) days: number;
}

export class DeleteCompanyDto {
  @ApiProperty() @IsOptional() @IsString() confirmName?: string;
}

export class LeadsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: LEAD_STATUSES }) @IsOptional() @IsIn(LEAD_STATUSES) status?: LeadStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class UpdateLeadDto {
  @ApiPropertyOptional({ enum: LEAD_STATUSES }) @IsOptional() @IsIn(LEAD_STATUSES) status?: LeadStatus;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() notes?: string | null;
}

export class EventsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() companyId?: string;
  @ApiPropertyOptional({ enum: EVENT_TYPES }) @IsOptional() @IsIn(EVENT_TYPES) type?: CompanyEventType;
}

export class CreateAdminDto {
  @ApiProperty() @IsString() @MinLength(2) name: string;
  @ApiProperty() @Transform(lower) @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
}

export class UpdateAdminDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) name?: string;
}

export class PricesDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_PRICE) ESSENTIALS?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_PRICE) GROWTH?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_PRICE) ENTERPRISE?: number | null;
}

export class BillingSettingsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(cleanNameTransform) @IsString() @MaxLength(NAME_MAX) sellerName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(cleanNameTransform) @IsString() @MaxLength(NAME_MAX) sellerNameEn?: string;
  @ApiPropertyOptional({ description: "'' (not VAT-registered) or a 15-digit TRN starting and ending with 3" }) @IsOptional() @IsString() @MaxLength(40) sellerVatNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) sellerCrNumber?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(cleanNameTransform) @IsString() @MaxLength(300) sellerAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) sellerEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) sellerPhone?: string;
  @ApiPropertyOptional({ example: 0.15 }) @IsOptional() @IsNumber() @Min(0) @Max(1) vatRate?: number;
  @ApiPropertyOptional({ example: 7 }) @IsOptional() @IsInt() @Min(0) @Max(90) invoiceDueDays?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(cleanNameTransform) @IsString() @MaxLength(NAME_MAX) bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) iban?: string;
  @ApiPropertyOptional({ example: 10, description: 'default billed seats for ESSENTIALS / GROWTH' }) @IsOptional() @IsInt() @Min(1) @Max(100000) minBilledEmployees?: number;
}

/** Reminder day list: up to 6 integers 0..60. */
const dayList = () => applyDecorators(IsOptional(), IsArray(), ArrayMaxSize(6), IsInt({ each: true }), Min(0, { each: true }), Max(60, { each: true }));

export class RemindersSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ type: [Number], example: [7, 3, 1] }) @dayList() trialDays?: number[];
  @ApiPropertyOptional({ type: [Number], example: [14, 7, 1] }) @dayList() subscriptionDays?: number[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyOnExpiry?: boolean;
  @ApiPropertyOptional({ type: [Number], example: [1, 7] }) @dayList() overdueInvoiceDays?: number[];
}

export class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireApproval?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(365) trialDays?: number;
  @ApiPropertyOptional({ type: PricesDto }) @IsOptional() @ValidateNested() @Type(() => PricesDto) prices?: PricesDto;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(0.9) annualDiscount?: number;
  @ApiPropertyOptional({ type: BillingSettingsDto, description: 'partial — merged into the stored billing settings' })
  @IsOptional() @ValidateNested() @Type(() => BillingSettingsDto) billing?: BillingSettingsDto;
  @ApiPropertyOptional({ type: RemindersSettingsDto, description: 'partial — merged into the stored reminder settings' })
  @IsOptional() @ValidateNested() @Type(() => RemindersSettingsDto) reminders?: RemindersSettingsDto;
}

export class BroadcastDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() @IsNotEmpty() body: string;
  @ApiProperty({ enum: ['ALL', 'ACTIVE', 'TRIAL'] }) @IsIn(['ALL', 'ACTIVE', 'TRIAL']) target: 'ALL' | 'ACTIVE' | 'TRIAL';
}
