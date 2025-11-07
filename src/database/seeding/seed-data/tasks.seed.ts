import { TaskStatus } from '../../../modules/tasks/enums/task-status.enum';
import { TaskPriority } from '../../../modules/tasks/enums/task-priority.enum';

export const tasks = [
  {
    id: '660e8400-e29b-41d4-a716-446655440000',
    title: 'Complete project documentation',
    description: 'Write comprehensive documentation for the API endpoints and data models',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    dueDate: new Date(new Date().setDate(new Date().getDate() + 7)), // Due in 7 days
    userId: '550e8400-e29b-41d4-a716-446655440000', // Admin user
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440001',
    title: 'Implement user authentication',
    description: 'Add JWT authentication to secure the API endpoints',
    status: TaskStatus.COMPLETED,
    priority: TaskPriority.HIGH,
    dueDate: new Date(new Date().setDate(new Date().getDate() - 3)), // Due 3 days ago
    userId: '550e8400-e29b-41d4-a716-446655440000', // Admin user
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440002',
    title: 'Design database schema',
    description: 'Create entity relationship diagrams for the database',
    status: TaskStatus.PENDING,
    priority: TaskPriority.MEDIUM,
    dueDate: new Date(new Date().setDate(new Date().getDate() + 14)), // Due in 14 days
    userId: '550e8400-e29b-41d4-a716-446655440001', // Normal user
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440003',
    title: 'Setup development environment',
    description: 'Configure local development environment with Docker',
    status: TaskStatus.PENDING,
    priority: TaskPriority.LOW,
    dueDate: new Date(new Date().setDate(new Date().getDate() + 1)), // Due tomorrow
    userId: '550e8400-e29b-41d4-a716-446655440001', // Normal user
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440004',
    title: 'Review pull requests',
    description: 'Review and merge pending pull requests from the team',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.MEDIUM,
    dueDate: new Date(new Date().setHours(new Date().getHours() + 5)), // Due in 5 hours
    userId: '550e8400-e29b-41d4-a716-446655440000', // Admin user
  },
]; 