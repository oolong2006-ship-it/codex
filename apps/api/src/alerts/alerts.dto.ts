import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { AlertType, Severity, AlertStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAlertDto {
  @ApiProperty({ enum: AlertType }) @IsEnum(AlertType) type!: AlertType;
  @ApiProperty({ enum: Severity }) @IsEnum(Severity) severity!: Severity;
  @ApiProperty() @IsString() message!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recommendedAction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() venueId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zoneId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() confidenceScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
}

export class AlertQueryDto {
  @ApiPropertyOptional({ enum: AlertStatus })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;
  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;
}
