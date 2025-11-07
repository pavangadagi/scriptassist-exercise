import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // TODO: Implement comprehensive request/response logging
    // This interceptor should:
    // 1. Log incoming requests with relevant details
    // 2. Measure and log response time
    // 3. Log outgoing responses
    // 4. Include contextual information like user IDs when available
    // 5. Avoid logging sensitive information

    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const url = req.url;
    const now = Date.now();

    // Basic implementation (to be enhanced by candidates)
    this.logger.log(`Request: ${method} ${url}`);

    return next.handle().pipe(
      tap({
        next: (val) => {
          this.logger.log(`Response: ${method} ${url} ${Date.now() - now}ms`);
        },
        error: (err) => {
          this.logger.error(`Error in ${method} ${url} ${Date.now() - now}ms: ${err.message}`);
        },
      }),
    );
  }
} 