import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  retryAfter?: number; // Seconds until next allowed request
}

/**
 * Redis-based rate limiting service
 * Implements sliding window algorithm for accurate rate limiting
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private redis: Redis;

  constructor(private configService: ConfigService) {
    this.initializeRedis();
  }

  private initializeRedis() {
    try {
      this.redis = new Redis({
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });

      this.redis.on('error', (err) => {
        this.logger.error('Redis connection error:', err);
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis connected for rate limiting');
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  /**
   * Check and consume rate limit using sliding window algorithm
   * @param key Unique identifier for the rate limit (e.g., user:123, ip:abc)
   * @param limit Maximum number of requests allowed
   * @param windowSeconds Time window in seconds
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const redisKey = `ratelimit:${key}`;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();

      // Remove old entries outside the window
      pipeline.zremrangebyscore(redisKey, 0, windowStart);

      // Count current requests in window
      pipeline.zcard(redisKey);

      // Add current request
      pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);

      // Set expiration
      pipeline.expire(redisKey, windowSeconds);

      const results = await pipeline.exec();

      // Extract count from results (index 1 is zcard result)
      const count = results && results[1] ? ((results[1][1] as number) || 0) : 0;
      const remaining = Math.max(0, limit - count - 1);
      const allowed = count < limit;

      const reset = now + windowSeconds * 1000;
      const retryAfter = allowed ? 0 : Math.ceil((reset - now) / 1000);

      return {
        allowed,
        limit,
        remaining,
        reset: Math.floor(reset / 1000),
        retryAfter,
      };
    } catch (error) {
      this.logger.error(`Rate limit check failed for key ${key}:`, error);
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        limit,
        remaining: limit,
        reset: Math.floor((now + windowSeconds * 1000) / 1000),
      };
    }
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetRateLimit(key: string): Promise<void> {
    const redisKey = `ratelimit:${key}`;
    try {
      await this.redis.del(redisKey);
      this.logger.log(`Rate limit reset for key: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to reset rate limit for key ${key}:`, error);
    }
  }

  /**
   * Get current rate limit status without consuming
   */
  async getRateLimitStatus(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const redisKey = `ratelimit:${key}`;

    try {
      // Remove old entries and count
      await this.redis.zremrangebyscore(redisKey, 0, windowStart);
      const count = await this.redis.zcard(redisKey);

      const remaining = Math.max(0, limit - count);
      const allowed = count < limit;
      const reset = now + windowSeconds * 1000;

      return {
        allowed,
        limit,
        remaining,
        reset: Math.floor(reset / 1000),
      };
    } catch (error) {
      this.logger.error(`Failed to get rate limit status for key ${key}:`, error);
      return {
        allowed: true,
        limit,
        remaining: limit,
        reset: Math.floor((now + windowSeconds * 1000) / 1000),
      };
    }
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
