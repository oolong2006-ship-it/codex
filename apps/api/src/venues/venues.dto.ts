import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { VenueType, OperationalStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateVenueDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() arabicName!: string;
  @ApiProperty({ enum: VenueType }) @IsEnum(VenueType) type!: VenueType;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) emergencyExits?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() contactManager?: string;
  @ApiPropertyOptional({ enum: OperationalStatus })
  @IsOptional()
  @IsEnum(OperationalStatus)
  status?: OperationalStatus;
  @ApiPropertyOptional({ description: 'Super admin only: target organization' })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

export class UpdateVenueDto extends PartialType(CreateVenueDto) {}
