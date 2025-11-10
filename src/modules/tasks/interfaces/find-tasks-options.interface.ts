import { PaginationOptions } from '../../../types/pagination.interface';
import { TaskStatus } from '../enums/task-status.enum';

export interface FindTasksOptions extends PaginationOptions {
  status?: TaskStatus;
  priority?: string;
  userId?: string;
  includeUser?: boolean;
  isOverdue?: boolean;
  idsOnly?: boolean;
}
