import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { OrgStatus, SubscriptionPlan } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() arabicName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() commercialName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPerson?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  subscriptionPlan?: SubscriptionPlan;
  @ApiPropertyOptional({ enum: OrgStatus })
  @IsOptional()
  @IsEnum(OrgStatus)
  status?: OrgStatus;
}

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}
