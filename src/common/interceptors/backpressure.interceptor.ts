import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

/**
 * Backpressure interceptor that limits concurrent HTTP requests
 * to prevent system overload and ensure predictable performance
 */
@Injectable()
export class BackpressureInterceptor implements NestInterceptor {
  private readonly logger = new Logger(BackpressureInterceptor.name);
  private activeRequests = 0;
  private readonly maxConcurrent: number;
  private lastCapacityWarning: Date | null = null;
  private wasAtCapacity = false;

  constructor(private readonly configService: ConfigService) {
    this.maxConcurrent = this.configService.get<number>(
      'MAX_CONCURRENT_REQUESTS',
      1000,
    );

    // Validate configuration
    if (this.maxConcurrent <= 0) {
      this.logger.warn(
        `Invalid MAX_CONCURRENT_REQUESTS value: ${this.maxConcurrent}. Using default: 1000`,
      );
      (this as any).maxConcurrent = 1000;
    }

    this.logger.log(
      `BackpressureInterceptor initialized with max concurrent requests: ${this.maxConcurrent}`,
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Check capacity before processing request
    if (!this.checkCapacity()) {
      this.logCapacityWarning();
      
      const response = context.switchToHttp().getResponse();
      response.setHeader('Retry-After', '5');
      
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Server is at capacity, please retry later',
          retryAfter: 5,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Increment counter for this request
    this.incrementCounter();

    // Track if request has been decremented
    let hasDecremented = false;

    return next.handle().pipe(
      catchError((error) => {
        // Decrement counter on error path
        if (!hasDecremented) {
          this.decrementCounter();
          hasDecremented = true;
        }
        return throwError(() => error);
      }),
      finalize(() => {
        // Decrement counter on completion (success or error)
        if (!hasDecremented) {
          this.decrementCounter();
          hasDecremented = true;
        }
      }),
    );
  }

  /**
   * Check if system has capacity for another request
   */
  private checkCapacity(): boolean {
    return this.activeRequests < this.maxConcurrent;
  }

  /**
   * Increment active request counter
   */
  private incrementCounter(): void {
    this.activeRequests++;

    // Log warning when capacity reaches 80%
    const capacityPercentage = (this.activeRequests / this.maxConcurrent) * 100;
    if (capacityPercentage >= 80 && capacityPercentage < 100) {
      const now = new Date();
      // Prevent log spam - only log once per minute
      if (
        !this.lastCapacityWarning ||
        now.getTime() - this.lastCapacityWarning.getTime() > 60000
      ) {
        this.logger.warn(
          `High capacity: ${this.activeRequests}/${this.maxConcurrent} active requests (${capacityPercentage.toFixed(1)}%)`,
        );
        this.lastCapacityWarning = now;
      }
    }

    // Track when we reach capacity
    if (this.activeRequests >= this.maxConcurrent) {
      this.wasAtCapacity = true;
    }
  }

  /**
   * Decrement active request counter
   */
  private decrementCounter(): void {
    if (this.activeRequests > 0) {
      this.activeRequests--;

      // Log info when capacity drops below 50% after being full
      if (this.wasAtCapacity && this.activeRequests < this.maxConcurrent * 0.5) {
        this.logger.log(
          `Capacity recovered: ${this.activeRequests}/${this.maxConcurrent} active requests`,
        );
        this.wasAtCapacity = false;
      }
    }
  }

  /**
   * Log warning when request is rejected due to capacity
   */
  private logCapacityWarning(): void {
    this.logger.warn(
      `Request rejected - server at capacity: ${this.activeRequests}/${this.maxConcurrent} active requests`,
    );
  }
}
