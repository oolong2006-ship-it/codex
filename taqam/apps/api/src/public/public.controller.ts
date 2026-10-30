import { Body, Controller, Get, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Min, MinLength, ValidateNested } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { calculateEndOfService, TerminationReason } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators';

export const TERMINATION_REASONS: TerminationReason[] = [
  'EMPLOYER_TERMINATION',
  'CONTRACT_END',
  'RESIGNATION',
  'ARTICLE_80',
  'ARTICLE_81',
  'FORCE_MAJEURE',
  'FEMALE_MARRIAGE_CHILDBIRTH',
  'RETIREMENT',
  'DEATH',
];

export class LeadDto {
  @ApiProperty() @IsString() @MinLength(2) name: string;
  @ApiProperty() @IsString() company: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() phone: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) employeesCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sector?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
}

export class WageDto {
  @ApiProperty() @IsNumber() @Min(0) basic: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) housing: number = 0;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) transport: number = 0;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) other: number = 0;
}

export class EosbDto {
  @ApiProperty({ example: '2019-01-01' }) @Matches(/^\d{4}-\d{2}-\d{2}/) startDate: string;
  @ApiProperty({ example: '2026-10-01' }) @Matches(/^\d{4}-\d{2}-\d{2}/) endDate: string;
  @ApiProperty({ type: WageDto }) @ValidateNested() @Type(() => WageDto) wage: WageDto;
  @ApiProperty({ enum: TERMINATION_REASONS }) @IsIn(TERMINATION_REASONS) reason: TerminationReason;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) unusedLeaveDays?: number;
}

@ApiTags('public')
@Public()
@Controller()
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness + database check (`SELECT 1`): 200 `{ status: 'ok', db: 'up' }`, 503 when the database is unreachable. */
  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down', message: 'Database unavailable', messageAr: 'قاعدة البيانات غير متاحة' });
    }
    return { status: 'ok', db: 'up' };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('public/leads')
  async lead(@Body() dto: LeadDto) {
    const lead = await this.prisma.lead.create({ data: dto });
    return { id: lead.id };
  }

  @HttpCode(200)
  @Post('public/eosb')
  eosb(@Body() dto: EosbDto) {
    const w = dto.wage;
    return calculateEndOfService({ ...dto, wage: { basic: w.basic, housing: w.housing ?? 0, transport: w.transport ?? 0, other: w.other ?? 0 } });
  }
}
