import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoanStatus, RequestType } from '@prisma/client';
import { IsEnum, IsNumber, IsObject, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class MyRequestDto {
  @ApiProperty({ enum: RequestType }) @IsEnum(RequestType) type: RequestType;
  @ApiProperty() @IsString() @MinLength(2) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() details?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) amount?: number;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

export class LoanDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty() @IsNumber() @Min(1) amount: number;
  @ApiProperty() @IsNumber() @Min(1) monthlyDeduction: number;
  @ApiProperty({ example: '2026-11' }) @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) startPeriod: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateLoanDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) monthlyDeduction?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) remaining?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) startPeriod?: string;
  @ApiPropertyOptional({ enum: LoanStatus }) @IsOptional() @IsEnum(LoanStatus) status?: LoanStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
