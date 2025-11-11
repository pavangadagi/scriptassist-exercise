import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  private readonly BATCH_SIZE = 100;

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private tasksService: TasksService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    const startTime = Date.now();
    this.logger.log('Starting overdue tasks check...');

    try {
      let totalProcessed = 0;

      // Use cursor-based pagination for efficient processing
      const result = await this.tasksService.processBatchWithCursor(
        this.BATCH_SIZE,
        async (tasks) => {
          // Extract task IDs from batch
          const taskIds = tasks.map(t => t.id);

          try {
            // Queue batch for notification
            await this.taskQueue.add(
              'overdue-tasks-notification',
              { taskIds },
              {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
              }
            );

            this.logger.debug(`Queued batch: ${taskIds.length} tasks`);
          } catch (error) {
            this.logger.error(
              `Failed to queue batch: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        },
        {
          isOverdue: true, // Filter for overdue tasks
        }
      );

      totalProcessed = result.totalProcessed;

      const duration = Date.now() - startTime;
      this.logger.log(
        `Overdue tasks check completed: ${totalProcessed} tasks processed in ${duration}ms`,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `Overdue tasks check failed after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
} 