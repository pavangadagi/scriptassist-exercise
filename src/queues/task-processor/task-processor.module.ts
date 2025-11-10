import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TaskProcessorService } from './task-processor.service';
import { TasksModule } from '../../modules/tasks/tasks.module';
import { TASK_PROCESSING_QUEUE, taskProcessingQueueOptions } from '../queue.config';

@Module({
  imports: [
    BullModule.registerQueue({
      name: TASK_PROCESSING_QUEUE,
      ...taskProcessingQueueOptions,
    }),
    TasksModule,
  ],
  providers: [TaskProcessorService],
  exports: [TaskProcessorService, BullModule],
})
export class TaskProcessorModule {} 