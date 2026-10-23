import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

const HHMM = /^([01]?\d|2[0-4]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ShiftDto {
  @ApiProperty() @IsString() branchId: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ example: '09:00' }) @Matches(HHMM) startTime: string;
  @ApiProperty({ example: '17:00' }) @Matches(HHMM) endTime: string;
  @ApiPropertyOptional({ default: 60 }) @IsOptional() @IsInt() @Min(0) @Max(240) breakMinutes?: number;
  @ApiPropertyOptional({ default: 15 }) @IsOptional() @IsInt() @Min(0) @Max(120) graceMinutes?: number;
  @ApiProperty({ type: [Number], example: [0, 1, 2, 3, 4] }) @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) days: number[];
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
}
export class UpdateShiftDto extends PartialType(ShiftDto) {}

export class RosterItemDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty({ nullable: true }) @IsOptional() @IsString() shiftId: string | null;
  @ApiProperty() @Matches(DATE) date: string;
}
export class RosterDto {
  @ApiProperty({ type: [RosterItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => RosterItemDto) assignments: RosterItemDto[];
}

export class ManualAttendanceDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty() @Matches(DATE) date: string;
  @ApiPropertyOptional({ description: '"HH:mm" (Riyadh) or ISO timestamp' }) @IsOptional() @IsString() checkIn?: string | null;
  @ApiPropertyOptional({ description: '"HH:mm" (Riyadh) or ISO timestamp' }) @IsOptional() @IsString() checkOut?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ enum: ['ABSENT'], description: 'Mark the day as absent explicitly' }) @IsOptional() @IsIn(['ABSENT']) status?: 'ABSENT';
}
export class UpdateAttendanceDto extends PartialType(ManualAttendanceDto) {}
