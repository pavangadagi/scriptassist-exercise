import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';
import { ObservableLogger } from '../services/logger.service';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: ObservableLogger) {
    this.logger.setContext('ExceptionFilter');
  }

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const correlationId = request.correlationId;
    const userId = (request.user as any)?.id || (request.user as any)?.sub;

    // Determine log level based on status code
    const isClientError = status >= 400 && status < 500;
    const isServerError = status >= 500;

    const errorContext = {
      correlationId,
      userId,
      method: request.method,
      url: request.url,
      statusCode: status,
      errorName: exception.name,
      ip: request.ip,
    };

    if (isServerError) {
      this.logger.error(
        `Server error: ${exception.message}`,
        exception.stack,
        errorContext,
      );
    } else if (isClientError) {
      this.logger.warn(`Client error: ${exception.message}`, errorContext);
    } else {
      this.logger.log(`HTTP exception: ${exception.message}`, errorContext);
    }

    // Format error response
    const errorResponse: Record<string, any> = {
      success: false,
      statusCode: status,
      message: exception.message,
      error: typeof exceptionResponse === 'object' 
        ? (exceptionResponse as any).error 
        : exceptionResponse,
      path: request.url,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    // Don't expose stack traces in production
    if (process.env.NODE_ENV !== 'production' && isServerError) {
      errorResponse.stack = exception.stack;
    }

    response.status(status).json(errorResponse);
  }
} 