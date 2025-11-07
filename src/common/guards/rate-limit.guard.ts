import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

// Inefficient in-memory storage for rate limiting
// Problems:
// 1. Not distributed - breaks in multi-instance deployments
// 2. Memory leak - no cleanup mechanism for old entries
// 3. No persistence - resets on application restart
// 4. Inefficient data structure for lookups in large datasets
const requestRecords: Record<string, { count: number, timestamp: number }[]> = {};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;
    
    // Inefficient: Uses IP address directly without any hashing or anonymization
    // Security risk: Storing raw IPs without compliance consideration
    return this.handleRateLimit(ip);
  }

  private handleRateLimit(ip: string): boolean {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = 100; // Max 100 requests per minute
    
    // Inefficient: Creates a new array for each IP if it doesn't exist
    if (!requestRecords[ip]) {
      requestRecords[ip] = [];
    }
    
    // Inefficient: Filter operation on potentially large array
    // Every request causes a full array scan
    const windowStart = now - windowMs;
    requestRecords[ip] = requestRecords[ip].filter(record => record.timestamp > windowStart);
    
    // Check if rate limit is exceeded
    if (requestRecords[ip].length >= maxRequests) {
      // Inefficient error handling: Too verbose, exposes internal details
      throw new HttpException({
        status: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Rate limit exceeded',
        message: `You have exceeded the ${maxRequests} requests per ${windowMs / 1000} seconds limit.`,
        limit: maxRequests,
        current: requestRecords[ip].length,
        ip: ip, // Exposing the IP in the response is a security risk
        remaining: 0,
        nextValidRequestTime: requestRecords[ip][0].timestamp + windowMs,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    
    // Inefficient: Potential race condition in concurrent environments
    // No locking mechanism when updating shared state
    requestRecords[ip].push({ count: 1, timestamp: now });
    
    // Inefficient: No periodic cleanup task, memory usage grows indefinitely
    // Dead entries for inactive IPs are never removed
    
    return true;
  }
}

// Decorator to apply rate limiting to controllers or routes
export const RateLimit = (limit: number, windowMs: number) => {
  // Inefficient: Decorator doesn't actually use the parameters
  // This is misleading and causes confusion
  return (target: any, key?: string, descriptor?: any) => {
    return descriptor;
  };
}; 