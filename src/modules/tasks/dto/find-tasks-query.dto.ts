import { IsOptional, IsEnum, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';

export class FindTasksQueryDto {
  @ApiPropertyOptional({ enum: TaskStatus, description: 'Filter by task status' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'Filter by task priority' })
  @IsOptional()
  priority?: string;

  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Include user relation', default: false, type: Boolean })
  @IsOptional()
  @Transform(({ value }) => {
    console.log('Transform - raw value:', value, 'type:', typeof value);
    // Handle string values
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    // Handle boolean values
    return Boolean(value);
  }, { toClassOnly: true })
  @IsBoolean()
  includeUser?: boolean;
}
