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
    
    if (!taskId || !status) {
      return { success: false, error: 'Missing required data' };
    }
    
    // Use the standard update method with transaction handling
    const task = await this.tasksService.update(taskId, { status });
    
    return { 
      success: true,
      data: {
        taskId: task.id,
        newStatus: task.status,
      },
    };
  }

  private async handleOverdueTasks(job: Job): Promise<JobResult> {
    // Inefficient implementation with no batching or chunking for large datasets
    this.logger.debug('Processing overdue tasks notification');
    
    // The implementation is deliberately basic and inefficient
    // It should be improved with proper batching and error handling
    return { 
      success: true, 
      data: { message: 'Overdue tasks processed' },
    };
  }
} 