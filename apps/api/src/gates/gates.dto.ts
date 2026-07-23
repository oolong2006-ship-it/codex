import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { GateType, GateStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateGateDto {
  @ApiProperty() @IsString() venueId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zoneId?: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() code!: string;
  @ApiPropertyOptional({ enum: GateType })
  @IsOptional()
  @IsEnum(GateType)
  type?: GateType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxCapacityPerMinute?: number;
  @ApiPropertyOptional({ enum: GateStatus })
  @IsOptional()
  @IsEnum(GateStatus)
  status?: GateStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
}

export class UpdateGateDto extends PartialType(CreateGateDto) {}

export class UpdateGateStatusDto {
  @ApiProperty({ enum: GateStatus }) @IsEnum(GateStatus) status!: GateStatus;
}
