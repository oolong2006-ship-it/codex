import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ZoneType, OperationalStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateZoneDto {
  @ApiProperty() @IsString() venueId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() arabicName?: string;
  @ApiProperty({ enum: ZoneType }) @IsEnum(ZoneType) type!: ZoneType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) currentOccupancy?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) entryPoints?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) exitPoints?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() parentZoneId?: string;
  @ApiPropertyOptional({ enum: OperationalStatus })
  @IsOptional()
  @IsEnum(OperationalStatus)
  status?: OperationalStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
}

export class UpdateZoneDto extends PartialType(CreateZoneDto) {}
