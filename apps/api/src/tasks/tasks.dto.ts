import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() assignedTeamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assignedUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zoneId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() incidentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
}

export class UpdateTaskStatusDto {
  @ApiProperty({ enum: TaskStatus }) @IsEnum(TaskStatus) status!: TaskStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string;
}
