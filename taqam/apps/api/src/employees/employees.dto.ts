import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ContractType, DocumentType, EmployeeStatus, Gender } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TerminationReason } from '@taqam/core';
import { TERMINATION_REASONS } from '../public/public.controller';

const DATE = /^\d{4}-\d{2}-\d{2}/;
const emptyToUndef = ({ value }: { value: unknown }) => (value === '' ? undefined : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class CreateUserForEmployeeDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
}

export class CreateEmployeeDto {
  @ApiPropertyOptional({ example: 'EMP-0001' }) @IsOptional() @IsString() employeeNumber?: string;
  @ApiProperty() @IsString() @MinLength(1) firstNameAr: string;
  @ApiProperty() @IsString() @MinLength(1) lastNameAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fullNameEn?: string;
  @ApiProperty({ example: 'SA' }) @Transform(upper) @IsString() @Length(2, 2) nationality: string;
  @ApiProperty({ enum: Gender }) @IsEnum(Gender) gender: Gender;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @Matches(DATE) birthDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() maritalStatus?: string;
  @ApiProperty() @IsString() @MinLength(5) nationalId: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @Matches(DATE) idExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passportNumber?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @Matches(DATE) passportExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @IsString() branchId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @IsString() departmentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @IsString() managerId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() jobTitle?: string;
  @ApiProperty({ example: '2024-01-01' }) @Matches(DATE) hireDate: string;
  @ApiPropertyOptional({ enum: ContractType }) @IsOptional() @IsEnum(ContractType) contractType?: ContractType;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @Matches(DATE) contractEndDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @Matches(DATE) probationEndDate?: string | null;
  @ApiPropertyOptional({ enum: EmployeeStatus }) @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) basicSalary: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) housingAllowance?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) transportAllowance?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) otherAllowances?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @IsString() iban?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() gosiRegistered?: boolean;
  /** First GOSI registration: on/after 2024-07-03 ⇒ NEW Social Insurance Law regime; null ⇒ LEGACY. */
  @ApiPropertyOptional({ example: '2025-01-10', nullable: true }) @IsOptional() @Transform(emptyToUndef) @Matches(DATE) gosiFirstRegisteredAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(12) hoursPerDay?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) annualLeaveCarryOver?: number;
  @ApiPropertyOptional({ type: CreateUserForEmployeeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateUserForEmployeeDto)
  createUser?: CreateUserForEmployeeDto;
}

/** Status TERMINATED and terminationDate are set only by POST /employees/:id/terminate (EOSB + login deactivation). */
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @ApiPropertyOptional() @IsOptional() @IsString() terminationReason?: string | null;
}

export class EosbQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString({ strict: true }) endDate?: string;
  @ApiPropertyOptional({ enum: TERMINATION_REASONS }) @IsOptional() @IsIn(TERMINATION_REASONS) reason?: TerminationReason;
}

export class TerminateDto {
  @ApiProperty() @Matches(DATE) terminationDate: string;
  @ApiProperty({ enum: TERMINATION_REASONS }) @IsIn(TERMINATION_REASONS) reason: TerminationReason;
}

export class DocumentDto {
  @ApiProperty({ enum: DocumentType }) @IsEnum(DocumentType) type: DocumentType;
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @Matches(DATE) issueDate?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToUndef) @Matches(DATE) expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
