import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const RateLimit = (options: RateLimitOptions) => {
  // Problem: This decorator doesn't actually enforce rate limiting
  // It only sets metadata that is never used by the guard
  return SetMetadata(RATE_LIMIT_KEY, options);
}; 