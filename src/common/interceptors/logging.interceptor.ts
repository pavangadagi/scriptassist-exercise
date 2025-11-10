import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ObservableLogger } from '../services/logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: ObservableLogger) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const { method, url, body, query, params, headers } = req;
    const correlationId = req.correlationId;
    const userId = req.user?.id || req.user?.sub;
    const startTime = Date.now();

    // Log incoming request
    this.logger.log('Incoming request', {
      correlationId,
      userId,
      method,
      url,
      query: Object.keys(query).length > 0 ? query : undefined,
      params: Object.keys(params).length > 0 ? params : undefined,
      userAgent: headers['user-agent'],
      ip: req.ip,
    });

    // Log request body (excluding sensitive fields)
    if (body && Object.keys(body).length > 0) {
      const sanitizedBody = this.sanitizeBody(body);
      this.logger.debug('Request body', {
        correlationId,
        body: sanitizedBody,
      });
    }

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;

          this.logger.log('Request completed', {
            correlationId,
            userId,
            method,
            url,
            statusCode,
            duration,
            responseSize: JSON.stringify(responseBody || {}).length,
          });

          // Log slow requests
          if (duration > 1000) {
            this.logger.warn('Slow request detected', {
              correlationId,
              method,
              url,
              duration,
            });
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          
          this.logger.error('Request failed', error.stack, {
            correlationId,
            userId,
            method,
            url,
            duration,
            errorName: error.name,
            errorMessage: error.message,
            statusCode: error.status || 500,
          });
        },
      }),
    );
  }

  private sanitizeBody(body: any): any {
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization'];
    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }
} 