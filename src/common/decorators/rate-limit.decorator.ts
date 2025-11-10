import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';
export const SKIP_RATE_LIMIT_KEY = 'skip_rate_limit';

export interface RateLimitOptions {
  limit: number;
  ttl: number; // Time to live in seconds
  keyPrefix?: string; // Custom prefix for rate limit key
  skipIf?: (context: any) => boolean; // Conditional skip function
}

/**
 * Apply custom rate limiting to a route or controller
 * @param options Rate limit configuration
 */
export const RateLimit = (options: RateLimitOptions) => {
  return SetMetadata(RATE_LIMIT_KEY, options);
};

/**
 * Skip rate limiting for specific routes (e.g., health checks)
 */
export const SkipRateLimit = () => {
  return SetMetadata(SKIP_RATE_LIMIT_KEY, true);
}; 