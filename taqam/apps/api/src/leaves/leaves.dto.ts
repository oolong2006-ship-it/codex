import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class MyLeaveDto {
  @ApiProperty() @IsString() leaveTypeId: string;
  @ApiProperty({ example: '2026-11-01' }) @Matches(DATE) startDate: string;
  @ApiProperty({ example: '2026-11-05' }) @Matches(DATE) endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class CreateLeaveDto extends MyLeaveDto {
  @ApiProperty() @IsString() employeeId: string;
}

export class DecisionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}
