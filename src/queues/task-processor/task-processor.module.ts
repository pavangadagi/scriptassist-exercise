import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TaskProcessorService } from './task-processor.service';
import { TasksModule } from '../../modules/tasks/tasks.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'task-processing',
      defaultJobOptions: {
        attempts: 3, // Retry up to 3 times
        backoff: {
          type: 'exponential', // Exponential backoff
          delay: 1000, // Start with 1 second delay
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000, // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    }),
    TasksModule,
  ],
  providers: [TaskProcessorService],
  exports: [TaskProcessorService],
})
export class TaskProcessorModule {} 