import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { EventType, EventStatus, SecurityLevel } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty() @IsString() venueId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() arabicName!: string;
  @ApiProperty({ enum: EventType }) @IsEnum(EventType) type!: EventType;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() doorsOpenTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) expectedAttendance?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() organizer?: string;
  @ApiPropertyOptional({ enum: SecurityLevel })
  @IsOptional()
  @IsEnum(SecurityLevel)
  securityLevel?: SecurityLevel;
  @ApiPropertyOptional() @IsOptional() @IsString() transportationPlan?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emergencyPlan?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() operationalNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class UpdateEventStatusDto {
  @ApiProperty({ enum: EventStatus }) @IsEnum(EventStatus) status!: EventStatus;
}
