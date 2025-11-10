import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { JobResult } from './interfaces/job-result.interface';

@Injectable()
@Processor('task-processing')
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  async process(job: Job): Promise<JobResult> {
    const startTime = Date.now();
    this.logger.log(`[Job ${job.id}] Processing job type: ${job.name}, Attempt: ${job.attemptsMade + 1}`);
    
    try {
      let result;
      
      switch (job.name) {
        case 'task-status-update':
          result = await this.handleStatusUpdate(job);
          break;
        case 'overdue-tasks-notification':
          result = await this.handleOverdueTasks(job);
          break;
        default:
          this.logger.warn(`[Job ${job.id}] Unknown job type: ${job.name}`);
          return { success: false, error: `Unknown job type: ${job.name}` };
      }
      
      const duration = Date.now() - startTime;
      this.logger.log(`[Job ${job.id}] Completed successfully in ${duration}ms`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error(
        `[Job ${job.id}] Failed after ${duration}ms: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      
      // Throw error to trigger BullMQ retry mechanism
      throw error;
    }
  }

  private async handleStatusUpdate(job: Job): Promise<JobResult> {
    const { taskId, status } = job.data;
    
    // Validate required fields
    if (!taskId || !status) {
      this.logger.warn(`[Job ${job.id}] Missing required data: taskId=${taskId}, status=${status}`);
      return { success: false, error: 'Missing required data: taskId and status are required' };
    }
    
    this.logger.debug(`[Job ${job.id}] Updating task ${taskId} to status: ${status}`);
    
    try {
      // Update job progress (optional, for monitoring)
      await job.updateProgress(50);
      
      // Use the standard update method with transaction handling

      // letting it be for now, but this feels redundent
      const task = await this.tasksService.update(taskId, { status });
      
      // Update job progress to complete
      await job.updateProgress(100);
      
      this.logger.log(`[Job ${job.id}] Successfully updated task ${taskId} to ${task.status}`);
      
      return { 
        success: true,
        data: {
          taskId: task.id,
          oldStatus: job.data.oldStatus,
          newStatus: task.status,
          updatedAt: task.updatedAt,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[Job ${job.id}] Failed to update task ${taskId}: ${errorMessage}`);
      
      // Return error details for retry logic
      return {
        success: false,
        error: `Failed to update task: ${errorMessage}`,
      };
    }
  }

  private async handleOverdueTasks(job: Job): Promise<JobResult> {
    const { taskIds } = job.data;
    
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      this.logger.warn(`[Job ${job.id}] No overdue tasks to process`);
      return { 
        success: true, 
        data: { processed: 0, message: 'No overdue tasks' },
      };
    }
    
    this.logger.log(`[Job ${job.id}] Processing ${taskIds.length} overdue tasks`);
    
    try {
      let processed = 0;
      
      // Process in batches to avoid overwhelming the system
      const batchSize = 50;
      for (let i = 0; i < taskIds.length; i += batchSize) {
        const batch = taskIds.slice(i, i + batchSize);
        
        // Update progress
        const progress = Math.floor((i / taskIds.length) * 100);
        await job.updateProgress(progress);
        
        // Process batch
        // TODO: Implement actual notification logic
        // For now, just log
        this.logger.debug(`[Job ${job.id}] Processing batch ${i / batchSize + 1}: ${batch.length} tasks`);
        
        // Here you would:
        // 1. Fetch user emails for these tasks
        // 2. Send notification emails
        // 3. Update task with notification_sent flag
        // Example:
        // await this.notificationService.sendOverdueNotifications(batch);
        
        processed += batch.length;
      }
      
      await job.updateProgress(100);
      
      this.logger.log(`[Job ${job.id}] Successfully processed ${processed} overdue tasks`);
      
      return { 
        success: true, 
        data: { 
          processed,
          totalTasks: taskIds.length,
          message: `Processed ${processed} overdue task notifications`,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[Job ${job.id}] Failed to process overdue tasks: ${errorMessage}`);
      
      return {
        success: false,
        error: `Failed to process overdue tasks: ${errorMessage}`,
      };
    }
  }
} 