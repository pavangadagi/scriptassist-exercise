import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface ConnectionStatus {
  connected: boolean;
  lastError?: string;
  lastErrorTime?: Date;
  reconnectAttempts: number;
}

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;
  private readonly defaultTTL = 300; // 5 minutes
  private isHealthy = true;
  private reconnectAttempts = 0;
  private lastError?: string;
  private lastErrorTime?: Date;

  constructor(private configService: ConfigService) {
    // Initialize Redis connection with configuration
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD') || undefined,
      db: this.configService.get('REDIS_DB', 0),
      
      // Connection pooling and retry strategy
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.warn(`Redis connection retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
      
      // Reconnection on specific errors
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      
      enableReadyCheck: true,
      enableOfflineQueue: true, // Queue commands when disconnected
      lazyConnect: false,
    });

    // Event handlers for connection monitoring
    this.redis.on('connect', () => {
      this.logger.log('Redis connected successfully');
      this.isHealthy = true;
      this.reconnectAttempts = 0;
    });

    this.redis.on('ready', () => {
      this.logger.log('Redis ready to accept commands');
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`, err.stack);
      this.isHealthy = false;
      this.lastError = err.message;
      this.lastErrorTime = new Date();
    });

    this.redis.on('reconnecting', (delay: number) => {
      this.reconnectAttempts++;
      this.logger.warn(`Redis reconnecting... Attempt ${this.reconnectAttempts}, delay: ${delay}ms`);
    });

    this.redis.on('close', () => {
      this.logger.warn('Redis connection closed');
      this.isHealthy = false;
    });
  }

  /**
   * Store a value in cache with optional TTL
   * @param key Cache key
   * @param value Value to store (will be JSON serialized)
   * @param ttlSeconds Time to live in seconds (default: 300)
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    // Skip if unhealthy
    if (!this.isHealthy) {
      this.logger.warn('Cache unhealthy, skipping write operation');
      return;
    }

    try {
      const ttl = ttlSeconds || this.defaultTTL;
      const serialized = JSON.stringify(value);
      
      const startTime = Date.now();
      await this.redis.setex(key, ttl, serialized);
      const duration = Date.now() - startTime;
      
      // Log slow operations
      if (duration > 100) {
        this.logger.warn(`Slow cache set operation: ${duration}ms for key: ${key}`);
      }
      
      this.logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Cache write failed for key: ${key}`, error instanceof Error ? error.stack : String(error));
      this.markUnhealthy(30000); // Retry after 30 seconds
    }
  }

  /**
   * Retrieve a value from cache
   * @param key Cache key
   * @returns Deserialized value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    // Skip if unhealthy
    if (!this.isHealthy) {
      this.logger.warn('Cache unhealthy, skipping read operation');
      return null;
    }

    try {
      const startTime = Date.now();
      const value = await this.redis.get(key);
      const duration = Date.now() - startTime;
      
      // Log slow operations
      if (duration > 100) {
        this.logger.warn(`Slow cache get operation: ${duration}ms for key: ${key}`);
      }
      
      if (value) {
        this.logger.debug(`Cache hit: ${key}`);
        return JSON.parse(value) as T;
      }
      
      this.logger.debug(`Cache miss: ${key}`);
      return null;
    } catch (error) {
      this.logger.error(`Cache read failed for key: ${key}`, error instanceof Error ? error.stack : String(error));
      this.markUnhealthy(30000);
      return null; // Graceful degradation
    }
  }

  /**
   * Delete a single key from cache
   * @param key Cache key to delete
   * @returns True if key existed and was deleted
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isHealthy) {
      this.logger.warn('Cache unhealthy, skipping delete operation');
      return false;
    }

    try {
      const result = await this.redis.del(key);
      this.logger.debug(`Cache delete: ${key} (existed: ${result > 0})`);
      return result > 0;
    } catch (error) {
      this.logger.error(`Cache delete failed for key: ${key}`, error instanceof Error ? error.stack : String(error));
      this.markUnhealthy(30000);
      return false;
    }
  }

  /**
   * Check if a key exists in cache
   * @param key Cache key
   * @returns True if key exists
   */
  async has(key: string): Promise<boolean> {
    if (!this.isHealthy) {
      return false;
    }

    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Cache exists check failed for key: ${key}`, error instanceof Error ? error.stack : String(error));
      return false;
    }
  }

  /**
   * Clear all keys from the current database
   */
  async clear(): Promise<void> {
    if (!this.isHealthy) {
      this.logger.warn('Cache unhealthy, skipping clear operation');
      return;
    }

    try {
      await this.redis.flushdb();
      this.logger.log('Cache cleared successfully');
    } catch (error) {
      this.logger.error('Cache clear failed', error instanceof Error ? error.stack : String(error));
      this.markUnhealthy(30000);
    }
  }

  /**
   * Invalidate all keys matching a pattern
   * @param pattern Redis key pattern (e.g., "task:123:*")
   * @returns Number of keys deleted
   */
  async invalidatePattern(pattern: string): Promise<number> {
    if (!this.isHealthy) {
      this.logger.warn('Cache unhealthy, skipping pattern invalidation');
      return 0;
    }

    try {
      const startTime = Date.now();
      
      // Find all matching keys
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        this.logger.debug(`No keys found matching pattern: ${pattern}`);
        return 0;
      }

      // Process deletions in batches of 1000 to prevent blocking
      const batchSize = 1000;
      let totalDeleted = 0;

      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        const deleted = await this.redis.del(...batch);
        totalDeleted += deleted;
      }

      const duration = Date.now() - startTime;
      this.logger.log(`Invalidated ${totalDeleted} keys matching pattern: ${pattern} (${duration}ms)`);
      
      return totalDeleted;
    } catch (error) {
      this.logger.error(`Pattern invalidation failed for: ${pattern}`, error instanceof Error ? error.stack : String(error));
      this.markUnhealthy(30000);
      return 0;
    }
  }

  /**
   * Get current health status
   * @returns True if Redis is healthy and connected
   */
  getHealthStatus(): boolean {
    return this.isHealthy && this.redis.status === 'ready';
  }

  /**
   * Get detailed connection status
   * @returns Connection status object
   */
  getConnectionStatus(): ConnectionStatus {
    return {
      connected: this.redis.status === 'ready',
      lastError: this.lastError,
      lastErrorTime: this.lastErrorTime,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Mark service as unhealthy and schedule recovery
   * @param recoveryDelayMs Time to wait before marking healthy again
   */
  private markUnhealthy(recoveryDelayMs: number): void {
    this.isHealthy = false;
    
    setTimeout(() => {
      if (this.redis.status === 'ready') {
        this.logger.log('Cache service recovered, marking as healthy');
        this.isHealthy = true;
      }
    }, recoveryDelayMs);
  }

  /**
   * Gracefully close Redis connection on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing Redis connection...');
    await this.redis.quit();
    this.logger.log('Redis connection closed');
  }
}
