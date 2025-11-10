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
      const taskIds: string[] = [];
      let page = 1;
      let totalPages = 1;

      // Fetch all overdue task IDs with pagination
      do {
        const result = await this.tasksService.findAll({
          isOverdue: true,
          idsOnly: true,
          limit: 10000,
          page,
        });

        taskIds.push(...result.data.map((task) => task.id));
        totalPages = result.meta.totalPages;
        page++;
      } while (page <= totalPages);

      if (taskIds.length === 0) {
        this.logger.log('No overdue tasks found');
        return;
      }

      this.logger.log(`Found ${taskIds.length} overdue tasks`);

      let queuedCount = 0;
      for (let i = 0; i < taskIds.length; i += this.BATCH_SIZE) {
        const batch = taskIds.slice(i, i + this.BATCH_SIZE);

        try {
          await this.taskQueue.add(
            'overdue-tasks-notification',
            { taskIds: batch },
          );

          queuedCount += batch.length;
          this.logger.debug(`Queued batch ${Math.floor(i / this.BATCH_SIZE) + 1}: ${batch.length} tasks`);
        } catch (error) {
          this.logger.error(
            `Failed to queue batch ${Math.floor(i / this.BATCH_SIZE) + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Overdue tasks check completed: ${queuedCount}/${taskIds.length} tasks queued in ${duration}ms`,
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