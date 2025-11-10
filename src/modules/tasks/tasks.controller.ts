import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, HttpStatus, BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { FindTasksQueryDto } from './dto/find-tasks-query.dto';
import { BatchOperationDto } from './dto/batch-operation.dto';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { TaskStatus } from './enums/task-status.enum';
import { BatchAction } from './enums/batch-action.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';

// This guard needs to be implemented or imported from the correct location
// We're intentionally leaving it as a non-working placeholder
class JwtAuthGuard {}

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @ApiOperation({ summary: 'Find all tasks with optional filtering and pagination' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns paginated tasks' })
  async findAll(@Query() query: FindTasksQueryDto) {
    return this.tasksService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns task statistics aggregated by status and priority' })
  async getStats() {
    return this.tasksService.getStatistics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns the task' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Task not found' })
  async findOne(
    @Param('id') id: string,
    @Query('includeUser') includeUser?: boolean,
  ) {
    // Service already throws NotFoundException if not found
    return this.tasksService.findOne(id, includeUser);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Task updated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Task not found' })
  @ApiResponse({ status: HttpStatus.SERVICE_UNAVAILABLE, description: 'Task processing service unavailable' })
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    // Service handles validation, transaction, and queue operations
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Task deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Task not found' })
  async remove(@Param('id') id: string) {
    await this.tasksService.remove(id);
    // Return 204 No Content on successful deletion
    return;
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Batch operation completed' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid action or empty task list' })
  async batchProcess(@Body() batchDto: BatchOperationDto) {
    const { tasks, action } = batchDto;

    // Prepare update data based on action
    const updateData = action === BatchAction.COMPLETE 
      ? { status: TaskStatus.COMPLETED } 
      : undefined;

    // Delegate to service
    const result = await this.tasksService.batchOperation(tasks, action, updateData);

    return {
      action,
      totalRequested: tasks.length,
      ...result,
    };
  }
} 