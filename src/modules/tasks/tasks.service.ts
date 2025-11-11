import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { BatchAction } from './enums/batch-action.enum';
import { PaginatedResponse } from '../../types/pagination.interface';
import { FindTasksOptions } from './interfaces/find-tasks-options.interface';
import { TaskStatistics } from './interfaces/task-statistics.interface';
import { ObservableLogger } from '../../common/services/logger.service';
import { CacheService } from '../../common/services/cache.service';

@Injectable()
export class TasksService {
  private readonly logger = new ObservableLogger();

  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private cacheService: CacheService,
  ) {
    this.logger.setContext('TasksService');
  }

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const startTime = Date.now();
    this.logger.log('Creating new task', { 
      title: createTaskDto.title,
      priority: createTaskDto.priority,
      userId: createTaskDto.userId,
    });

    try {
      const result = await this.tasksRepository.manager.transaction(async manager => {
        // Create and save task
        const task = manager.create(Task, createTaskDto);
        const savedTask = await manager.save(task);

        this.logger.debug('Task saved to database', { taskId: savedTask.id });

        // Add to queue - failure will rollback the task creation
        await this.taskQueue.add('task-status-update', {
          taskId: savedTask.id,
          status: savedTask.status,
        });

        this.logger.debug('Task added to processing queue', { taskId: savedTask.id });

        return savedTask;
      });

      const duration = Date.now() - startTime;
      this.logger.log('Task created successfully', { 
        taskId: result.id,
        duration,
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Handle specific error types
      if (error.message.includes('queue')) {
        this.logger.error('Queue service unavailable', error.stack, { duration });
        throw new ServiceUnavailableException('Task processing service is currently unavailable');
      }
      
      if (error.code === '23505') { // PostgreSQL unique violation
        this.logger.warn('Duplicate task creation attempt', { 
          title: createTaskDto.title,
          duration,
        });
        throw new ConflictException('A task with similar properties already exists');
      }
      
      this.logger.error('Failed to create task', error.stack, { 
        error: error.message,
        duration,
      });
      throw error;
    }
    
    
    // const task = this.tasksRepository.create(createTaskDto);
    // const savedTask = await this.tasksRepository.save(task);

    // // Add to queue without waiting for confirmation or handling errors
    // this.taskQueue.add('task-status-update', {
    //   taskId: savedTask.id,
    //   status: savedTask.status,
    // });

    // return savedTask;
  }

  async findAll(options?: FindTasksOptions): Promise<PaginatedResponse<Task>> {
    const startTime = Date.now();
    const page = options?.page || 1;
    const limit = options?.limit || 10;
    const skip = (page - 1) * limit;
    
    this.logger.debug('Finding tasks', { page, limit, filters: options });
    
    const queryBuilder = this.tasksRepository.createQueryBuilder('task');

    // Select only IDs if requested
    if (options?.idsOnly) {
      queryBuilder.select('task.id');
    }

    // Optional user relation
    if (options?.includeUser) {
      queryBuilder.leftJoinAndSelect('task.user', 'user');
    }

    // Filtering
    if (options?.status) {
      queryBuilder.andWhere('task.status = :status', { status: options.status });
    }

    if (options?.priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority: options.priority });
    }

    if (options?.userId) {
      queryBuilder.andWhere('task.userId = :userId', { userId: options.userId });
    }

    // Overdue filter
    if (options?.isOverdue) {
      const now = new Date();
      queryBuilder.andWhere('task.dueDate < :now', { now });
      queryBuilder.andWhere('task.status IN (:...statuses)', {
        statuses: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
      });
      queryBuilder.orderBy('task.dueDate', 'ASC');
    }

    // Pagination
    queryBuilder.skip(skip).take(limit);

    // Execute query with count
    const [data, total] = await queryBuilder.getManyAndCount();

    const duration = Date.now() - startTime;
    this.logger.log('Tasks retrieved', { 
      count: data.length,
      total,
      page,
      duration,
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, includeUser = false): Promise<Task> {
    // Generate cache key
    const cacheKey = `task:${id}:user:${includeUser}`;
    
    // Try cache first (cache-aside pattern)
    const cached = await this.cacheService.get<Task>(cacheKey);
    if (cached) {
      this.logger.debug('Cache hit for task', { taskId: id, includeUser });
      return cached;
    }
    
    // Cache miss - fetch from database
    this.logger.debug('Cache miss for task, querying database', { taskId: id, includeUser });
    
    const queryBuilder = this.tasksRepository
      .createQueryBuilder('task')
      .where('task.id = :id', { id });

    // Optional user relation
    if (includeUser) {
      queryBuilder.leftJoinAndSelect('task.user', 'user');
    }

    const task = await queryBuilder.getOne();

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // Store in cache with 5-minute TTL
    await this.cacheService.set(cacheKey, task, 300);
    this.logger.debug('Task stored in cache', { taskId: id, includeUser });

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const startTime = Date.now();
    this.logger.log('Updating task', { taskId: id, updates: updateTaskDto });

    try {
      const result = await this.tasksRepository.manager.transaction(async (manager) => {
        // Find task within transaction
        const task = await manager.findOne(Task, { where: { id } });

        if (!task) {
          this.logger.warn('Task not found for update', { taskId: id });
          throw new NotFoundException(`Task with ID ${id} not found`);
        }

        const originalStatus = task.status;

        // Merge updates efficiently
        manager.merge(Task, task, updateTaskDto);

        // Save within transaction
        const updatedTask = await manager.save(task);

        // Add to queue if status changed
        if (originalStatus !== updatedTask.status) {
          this.logger.debug('Task status changed, adding to queue', { 
            taskId: id,
            oldStatus: originalStatus,
            newStatus: updatedTask.status,
          });
          
          await this.taskQueue.add('task-status-update', {
            taskId: updatedTask.id,
            status: updatedTask.status,
          });
        }

        // Invalidate cache after successful update
        const invalidated = await this.cacheService.invalidatePattern(`task:${id}:*`);
        this.logger.debug('Cache invalidated after update', { taskId: id, keysInvalidated: invalidated });

        return updatedTask;
      });

      const duration = Date.now() - startTime;
      this.logger.log('Task updated successfully', { taskId: id, duration });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error.message?.includes('queue')) {
        this.logger.error('Queue service unavailable during update', error.stack, { 
          taskId: id,
          duration,
        });
        throw new ServiceUnavailableException('Task processing service is currently unavailable');
      }

      this.logger.error('Failed to update task', error.stack, { 
        taskId: id,
        error: error.message,
        duration,
      });
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    // Invalidate cache before deletion
    const invalidated = await this.cacheService.invalidatePattern(`task:${id}:*`);
    this.logger.debug('Cache invalidated before deletion', { taskId: id, keysInvalidated: invalidated });

    const result = await this.tasksRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
  }

  async getStatistics(): Promise<TaskStatistics> {
    // Use SQL aggregation for efficient statistics calculation
    const statusStats = await this.tasksRepository
      .createQueryBuilder('task')
      .select('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.status')
      .getRawMany<{ status: string; count: string }>();

    const priorityStats = await this.tasksRepository
      .createQueryBuilder('task')
      .select('task.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.priority')
      .getRawMany<{ priority: string; count: string }>();

    // Get total count
    const total = await this.tasksRepository.count();

    // Transform results into a more usable format
    const statistics: TaskStatistics = {
      total,
      byStatus: {
        pending: 0,
        in_progress: 0,
        completed: 0,
      },
      byPriority: {
        low: 0,
        medium: 0,
        high: 0,
      },
    };

    // Map status counts
    statusStats.forEach((stat) => {
      const count = parseInt(stat.count, 10);
      if (stat.status === TaskStatus.PENDING) statistics.byStatus.pending = count;
      if (stat.status === TaskStatus.IN_PROGRESS) statistics.byStatus.in_progress = count;
      if (stat.status === TaskStatus.COMPLETED) statistics.byStatus.completed = count;
    });

    // Map priority counts
    priorityStats.forEach((stat) => {
      const count = parseInt(stat.count, 10);
      const priority = stat.priority.toLowerCase() as 'low' | 'medium' | 'high';
      if (priority in statistics.byPriority) {
        statistics.byPriority[priority] = count;
      }
    });

    return statistics;
  }

  async batchOperation(
    taskIds: string[],
    action: BatchAction,
    updateData?: Partial<Task>,
  ): Promise<{ success: number; failed: number }> {
    try {
      let result;

      if (action === BatchAction.COMPLETE) {
        if (!updateData) {
          throw new Error('Update data is required for update operation');
        }
        // Bulk update using QueryBuilder
        result = await this.tasksRepository
          .createQueryBuilder()
          .update(Task)
          .set(updateData)
          .whereInIds(taskIds)
          .execute();
      } else if (action === BatchAction.DELETE) {
        // Bulk delete using QueryBuilder
        result = await this.tasksRepository
          .createQueryBuilder()
          .delete()
          .from(Task)
          .whereInIds(taskIds)
          .execute();
      } else {
        throw new Error(`Unknown batch action: ${action}`);
      }

      return {
        success: result.affected || 0,
        failed: taskIds.length - (result.affected || 0),
      };
    } catch (error) {
      throw new ServiceUnavailableException(`Batch operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
