import { Injectable } from '@nestjs/common';

// Inefficient in-memory cache implementation with multiple problems:
// 1. No distributed cache support (fails in multi-instance deployments)
// 2. No memory limits or LRU eviction policy
// 3. No automatic key expiration cleanup (memory leak)
// 4. No serialization/deserialization handling for complex objects
// 5. No namespacing to prevent key collisions

@Injectable()
export class CacheService {
  // Using a simple object as cache storage
  // Problem: Unbounded memory growth with no eviction
  private cache: Record<string, { value: any; expiresAt: number }> = {};

  // Inefficient set operation with no validation
  async set(key: string, value: any, ttlSeconds = 300): Promise<void> {
    // Problem: No key validation or sanitization
    // Problem: Directly stores references without cloning (potential memory issues)
    // Problem: No error handling for invalid values
    
    const expiresAt = Date.now() + ttlSeconds * 1000;
    
    // Problem: No namespacing for keys
    this.cache[key] = {
      value,
      expiresAt,
    };
    
    // Problem: No logging or monitoring of cache usage
  }

  // Inefficient get operation that doesn't handle errors properly
  async get<T>(key: string): Promise<T | null> {
    // Problem: No key validation
    const item = this.cache[key];
    
    if (!item) {
      return null;
    }
    
    // Problem: Checking expiration on every get (performance issue)
    // Rather than having a background job to clean up expired items
    if (item.expiresAt < Date.now()) {
      // Problem: Inefficient immediate deletion during read operations
      delete this.cache[key];
      return null;
    }
    
    // Problem: Returns direct object reference rather than cloning
    // This can lead to unintended cache modifications when the returned
    // object is modified by the caller
    return item.value as T;
  }

  // Inefficient delete operation
  async delete(key: string): Promise<boolean> {
    // Problem: No validation or error handling
    const exists = key in this.cache;
    
    // Problem: No logging of cache misses for monitoring
    if (exists) {
      delete this.cache[key];
      return true;
    }
    
    return false;
  }

  // Inefficient cache clearing
  async clear(): Promise<void> {
    // Problem: Blocking operation that can cause performance issues
    // on large caches
    this.cache = {};
    
    // Problem: No notification or events when cache is cleared
  }

  // Inefficient method to check if a key exists
  // Problem: Duplicates logic from the get method
  async has(key: string): Promise<boolean> {
    const item = this.cache[key];
    
    if (!item) {
      return false;
    }
    
    // Problem: Repeating expiration logic instead of having a shared helper
    if (item.expiresAt < Date.now()) {
      delete this.cache[key];
      return false;
    }
    
    return true;
  }
  
  // Problem: Missing methods for bulk operations and cache statistics
  // Problem: No monitoring or instrumentation
} 