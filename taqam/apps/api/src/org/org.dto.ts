import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class BranchDto {
  @ApiProperty() @IsString() @MinLength(2) nameAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameEn?: string;
  @ApiProperty() @IsString() city: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) lat: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) lng: number;
  @ApiPropertyOptional({ default: 150 }) @IsOptional() @IsInt() @Min(10) @Max(10000) radiusMeters?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() managerEmployeeId?: string | null;
}
export class UpdateBranchDto extends PartialType(BranchDto) {}

export class DepartmentDto {
  @ApiProperty() @IsString() @MinLength(2) name: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() parentId?: string | null;
}
export class UpdateDepartmentDto extends PartialType(DepartmentDto) {}
