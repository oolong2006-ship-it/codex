import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartSimulationDto {
  @ApiProperty({ example: 'CROWD_SURGE' })
  @IsString()
  scenario!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventId?: string;
}
