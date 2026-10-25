import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class RegisterDto {
  @ApiProperty() @IsString() @MinLength(2) companyNameAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyNameEn?: string;
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
