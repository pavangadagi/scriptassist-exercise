import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OverdueTasksService } from './overdue-tasks.service';
import { TasksModule } from '../../modules/tasks/tasks.module';
import { TaskProcessorModule } from '../task-processor/task-processor.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TaskProcessorModule,
    TasksModule,
  ],
  providers: [OverdueTasksService],
  exports: [OverdueTasksService],
})
export class ScheduledTasksModule {} 