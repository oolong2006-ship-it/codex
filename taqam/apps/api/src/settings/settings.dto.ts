import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateCompanyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() nameAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() crNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() establishmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gosiNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vatNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sector?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() iban?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankCode?: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekendDays?: number[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(28) payrollDay?: number;
}

/** Roles a company may assign — SUPER_ADMIN is platform-only. */
const COMPANY_ROLES: Role[] = ['OWNER', 'HR_ADMIN', 'PAYROLL', 'BRANCH_MANAGER', 'EMPLOYEE'];

const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class CreateUserDto {
  @ApiProperty() @Transform(lower) @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(2) name: string;
  @ApiProperty({ enum: COMPANY_ROLES }) @IsIn(COMPANY_ROLES) role: Role;
  @ApiProperty() @IsString() @MinLength(8) password: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: COMPANY_ROLES }) @IsOptional() @IsIn(COMPANY_ROLES) role?: Role;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(8) password?: string;
}

export class LeaveTypeDto {
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9_]+$/) code: string;
  @ApiProperty() @IsString() nameAr: string;
  @ApiProperty() @IsString() nameEn: string;
  @ApiProperty() @IsBoolean() paid: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(0) maxDaysPerYear?: number | null;
}
export class UpdateLeaveTypeDto extends PartialType(LeaveTypeDto) {}

export class HolidayDto {
  @ApiProperty({ example: '2026-09-23' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @ApiProperty() @IsString() nameAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameEn?: string;
}
