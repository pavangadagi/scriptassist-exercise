import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { PaginatedResponse } from '../../types/pagination.interface';
import { FindTasksOptions } from './interfaces/find-tasks-options.interface';

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

    const queryBuilder = this.tasksRepository.createQueryBuilder('task');

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




}
