# Observable Logger Usage Examples

## Basic Usage in Services

```typescript
import { ObservableLogger } from '../../common/services/logger.service';

@Injectable()
export class MyService {
  private readonly logger = new ObservableLogger();

  constructor() {
    this.logger.setContext('MyService');
  }

  async myMethod() {
    // Simple log
    this.logger.log('Operation started');

    // Log with context
    this.logger.log('User action', { 
      userId: '123',
      action: 'create',
    });

    // Debug logs (only in development)
    this.logger.debug('Detailed info', { data: someData });

    // Warning logs
    this.logger.warn('Potential issue detected', { 
      threshold: 100,
      current: 95,
    });

    // Error logs with stack trace
    try {
      // ... code
    } catch (error: any) {
      this.logger.error('Operation failed', error.stack, {
        userId: '123',
        operation: 'create',
      });
    }
  }
}
```

## Tracking Performance

```typescript
async createTask(dto: CreateTaskDto) {
  const startTime = Date.now();
  
  this.logger.log('Creating task', { title: dto.title });

  try {
    const result = await this.repository.save(dto);
    
    const duration = Date.now() - startTime;
    this.logger.log('Task created', { 
      taskId: result.id,
      duration,
    });

    // Alert on slow operations
    if (duration > 1000) {
      this.logger.warn('Slow operation detected', { 
        operation: 'createTask',
        duration,
      });
    }

    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    this.logger.error('Failed to create task', error.stack, { 
      duration,
      error: error.message,
    });
    throw error;
  }
}
```

## Correlation ID Usage

The correlation ID is automatically added by the middleware and flows through:

```typescript
// In your service, access it from the request context
async handleRequest(req: Request) {
  const correlationId = req['correlationId'];
  
  this.logger.log('Processing request', { 
    correlationId,
    userId: req.user?.id,
  });
}
```

## Log Output Examples

### Development Mode (Human-readable)
```
[2025-11-10T14:30:15.123Z] [INFO] [TasksService] Creating task | {"title":"New Task","userId":"123"}
[2025-11-10T14:30:15.456Z] [INFO] [TasksService] Task created | {"taskId":"abc-123","duration":333}
```

### Production Mode (JSON for log aggregation)
```json
{"timestamp":"2025-11-10T14:30:15.123Z","level":"info","context":"TasksService","message":"Creating task","title":"New Task","userId":"123"}
{"timestamp":"2025-11-10T14:30:15.456Z","level":"info","context":"TasksService","message":"Task created","taskId":"abc-123","duration":333}
```

## Best Practices

1. **Always set context** in constructor: `this.logger.setContext('ServiceName')`
2. **Include relevant data** in context object, not in message string
3. **Track duration** for important operations
4. **Use appropriate log levels**:
   - `debug`: Detailed diagnostic info
   - `log`: General informational messages
   - `warn`: Warning conditions
   - `error`: Error conditions with stack traces
5. **Sanitize sensitive data** before logging (passwords, tokens, etc.)
6. **Include correlation IDs** for request tracing
7. **Log both success and failure** paths
