import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { cleanNameTransform, NAME_MAX } from '../common/text';
import { Transform } from 'class-transformer';

const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class RegisterDto {
  @ApiProperty({ maxLength: NAME_MAX }) @Transform(cleanNameTransform) @IsString() @MinLength(2) @MaxLength(NAME_MAX) companyNameAr: string;
  @ApiPropertyOptional({ maxLength: NAME_MAX }) @IsOptional() @Transform(cleanNameTransform) @IsString() @MaxLength(NAME_MAX) companyNameEn?: string;
  @ApiProperty({ example: 'RESTAURANTS' }) @IsString() sector: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) employeesCount?: number;
  @ApiProperty() @IsString() @MinLength(2) ownerName: string;
  @ApiProperty() @Transform(lower) @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'owner@shuoon.demo' }) @Transform(lower) @IsEmail() email: string;
  @ApiProperty({ example: 'Shuoon@2026' }) @IsString() password: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() currentPassword: string;
  @ApiProperty() @IsString() @MinLength(8) newPassword: string;
}
