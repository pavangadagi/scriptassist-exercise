import { IsArray, IsEnum, IsNotEmpty, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BatchAction } from '../enums/batch-action.enum';

export class BatchOperationDto {
  @ApiProperty({ 
    description: 'Array of task IDs to process',
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
    type: [String]
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsNotEmpty({ each: true })
  tasks: string[];

  @ApiProperty({ 
    description: 'Action to perform on tasks',
    enum: BatchAction,
    example: BatchAction.COMPLETE
  })
  @IsEnum(BatchAction)
  action: BatchAction;
}
