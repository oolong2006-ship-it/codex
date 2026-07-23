import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IncidentType, Severity, IncidentStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType }) @IsEnum(IncidentType) type!: IncidentType;
  @ApiProperty({ enum: Severity }) @IsEnum(Severity) severity!: Severity;
  @ApiProperty() @IsString() description!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() venueId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zoneId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assignedTeamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
}

export class UpdateIncidentDto {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() assignedTeamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rootCause?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() correctiveAction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() closureNotes?: string;
}

export class AddIncidentUpdateDto {
  @ApiProperty() @IsString() message!: string;
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  statusTo?: IncidentStatus;
  @ApiPropertyOptional() @IsOptional() isInternal?: boolean;
}
