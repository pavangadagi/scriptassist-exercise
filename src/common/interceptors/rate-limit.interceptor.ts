import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RateLimitService } from '../services/rate-limit.service';
import { RATE_LIMIT_KEY, SKIP_RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { createHash } from 'crypto';

/**
 * Rate limiting interceptor that adds rate limit headers to responses
 * and enforces custom rate limits defined via decorators
 */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Check if rate limiting should be skipped
    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipRateLimit) {
      return next.handle();
    }

    // Get custom rate limit options
    const customOptions = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!customOptions) {
      return next.handle();
    }

    // Generate tracking key
    const key = this.generateKey(request, customOptions.keyPrefix);

    // Check rate limit
    const result = await this.rateLimitService.checkRateLimit(
      key,
      customOptions.limit,
      customOptions.ttl,
    );

    // Add rate limit headers
    response.setHeader('X-RateLimit-Limit', result.limit);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader('X-RateLimit-Reset', result.reset);

    if (!result.allowed) {
      response.setHeader('Retry-After', result.retryAfter);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          error: 'Too Many Requests',
          limit: result.limit,
          remaining: result.remaining,
          reset: result.reset,
          retryAfter: result.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return next.handle().pipe(
      tap(() => {
        // Headers are already set, just log if needed
      }),
    );
  }

  /**
   * Generate unique key for rate limiting
   */
  private generateKey(req: any, prefix?: string): string {
    const user = req.user;
    const basePrefix = prefix || 'custom';

    // For authenticated users, use user ID
    if (user?.id) {
      return `${basePrefix}:user:${user.id}`;
    }

    // For anonymous users, use hashed IP
    const ip = this.getClientIp(req);
    const hashedIp = this.hashIp(ip);
    return `${basePrefix}:ip:${hashedIp}`;
  }

  /**
   * Extract client IP from request
   */
  private getClientIp(req: any): string {
    return (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      'unknown'
    );
  }

  /**
   * Hash IP address for privacy
   */
  private hashIp(ip: string): string {
    return createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }
}
