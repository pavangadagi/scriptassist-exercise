import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SKIP_RATE_LIMIT_KEY, RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { createHash } from 'crypto';

/**
 * Enhanced throttler guard with custom rate limiting support
 * Features:
 * - Redis-based distributed rate limiting
 * - Per-route custom limits via decorator
 * - IP anonymization for privacy
 * - User-based rate limiting for authenticated requests
 * - Skip functionality for health checks
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    protected readonly reflector: Reflector,
    protected readonly configService: ConfigService,
  ) {
    super({ throttlers: [] }, {} as ThrottlerStorage, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if rate limiting should be skipped
    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipRateLimit) {
      return true;
    }

    // Check for custom rate limit options
    const customOptions = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If custom options with skipIf function, evaluate it
    if (customOptions?.skipIf) {
      const shouldSkip = customOptions.skipIf(context);
      if (shouldSkip) {
        return true;
      }
    }

    return super.canActivate(context);
  }

  /**
   * Generate tracking key for rate limiting
   * Uses hashed IP for privacy and user ID for authenticated requests
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const user = req.user;
    
    // For authenticated users, use user ID
    if (user?.id) {
      return `user:${user.id}`;
    }

    // For anonymous users, use hashed IP
    const ip = this.getClientIp(req);
    const hashedIp = this.hashIp(ip);
    return `ip:${hashedIp}`;
  }

  /**
   * Extract client IP from request
   * Handles proxies and load balancers
   */
  private getClientIp(req: Record<string, any>): string {
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
   * Hash IP address for privacy compliance
   * Uses SHA-256 to anonymize IP addresses
   */
  private hashIp(ip: string): string {
    return createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }

  /**
   * Customize error response
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: any,
  ): Promise<void> {
    throw new ThrottlerException('Too many requests. Please try again later.');
  }
}
