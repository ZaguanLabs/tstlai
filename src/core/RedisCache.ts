import Redis from 'ioredis';
import { TranslationCache } from '../types';

export class RedisCache implements TranslationCache {
  private redis: Redis;
  private ttl: number;

  constructor(connectionString?: string, ttl: number = 3600) {
    this.ttl = ttl;
    
    const url = connectionString || process.env.REDIS_URL;
    
    if (url) {
      this.redis = new Redis(url);
    } else {
      // Defaults to localhost:6379
      this.redis = new Redis();
    }

    this.redis.on('error', (err) => {
      console.error('[RedisCache] Error:', err);
    });

    this.redis.on('connect', () => {
      // Optional: console.log('[RedisCache] Connected');
    });
  }

  async get(hash: string): Promise<string | null> {
    try {
      return await this.redis.get(hash);
    } catch (error) {
      console.error('[RedisCache] Get Error:', error);
      return null;
    }
  }

  async set(hash: string, translation: string): Promise<void> {
    try {
      if (this.ttl > 0) {
        await this.redis.set(hash, translation, 'EX', this.ttl);
      } else {
        await this.redis.set(hash, translation);
      }
    } catch (error) {
      console.error('[RedisCache] Set Error:', error);
    }
  }
  
  // Helper to close connection if needed
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
