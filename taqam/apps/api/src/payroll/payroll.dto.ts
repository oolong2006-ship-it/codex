import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CreateRunDto {
  @ApiProperty({ example: '2026-10' }) @Matches(PERIOD) period: string;
}

export class AdjustmentDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty({ example: '2026-10' }) @Matches(PERIOD) period: string;
  @ApiProperty({ enum: AdjustmentType }) @IsEnum(AdjustmentType) type: AdjustmentType;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
