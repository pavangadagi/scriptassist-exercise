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

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    try {
      return await this.tasksRepository.manager.transaction(async manager => {
        // Create and save task
        const task = manager.create(Task, createTaskDto);
        const savedTask = await manager.save(task);

        // Add to queue - failure will rollback the task creation
        await this.taskQueue.add('task-status-update', {
          taskId: savedTask.id,
          status: savedTask.status,
        });

        return savedTask;
      });
    } catch (error: any) {
      // Handle specific error types
      if (error.message.includes('queue')) {
        throw new ServiceUnavailableException('Task processing service is currently unavailable');
      }
      
      if (error.code === '23505') { // PostgreSQL unique violation
        throw new ConflictException('A task with similar properties already exists');
      }
      
      // Re-throw other errors
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
    const page = options?.page || 1;
    const limit = options?.limit || 10;
    const skip = (page - 1) * limit;
    console.log("options: ", options)
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

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    try {
      return await this.tasksRepository.manager.transaction(async (manager) => {
        // Find task within transaction
        const task = await manager.findOne(Task, { where: { id } });

        if (!task) {
          throw new NotFoundException(`Task with ID ${id} not found`);
        }

        const originalStatus = task.status;

        // Merge updates efficiently
        manager.merge(Task, task, updateTaskDto);

        // Save within transaction
        const updatedTask = await manager.save(task);

        // Add to queue if status changed
        if (originalStatus !== updatedTask.status) {
          await this.taskQueue.add('task-status-update', {
            taskId: updatedTask.id,
            status: updatedTask.status,
          });
        }

        return updatedTask;
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error.message?.includes('queue')) {
        throw new ServiceUnavailableException('Task processing service is currently unavailable');
      }

      throw error;
    }
  }

  async remove(id: string): Promise<void> {
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
