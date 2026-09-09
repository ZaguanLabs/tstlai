import { Redis } from 'ioredis';
import { TranslationCache } from '../types';

export class RedisCache implements TranslationCache {
  private redis: Redis;

  constructor(
    connectionString?: string,
    private ttl = 3600,
    keyPrefix = 'tstlai:',
    commandTimeout = 1000,
  ) {
    if (!Number.isSafeInteger(ttl) || ttl < 0) throw new Error('Invalid cache.ttl');
    if (!Number.isSafeInteger(commandTimeout) || commandTimeout < 1)
      throw new Error('Invalid cache.commandTimeout');
    const url = connectionString || process.env.REDIS_URL;
    const options = {
      keyPrefix,
      commandTimeout,
      connectTimeout: commandTimeout,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    };
    this.redis = url ? new Redis(url, options) : new Redis(options);
    this.redis.on('error', (err) => console.error('[RedisCache] Error:', err));
  }

  async get(key: string): Promise<string | null> {
    return (await this.getMany([key]))[0];
  }

  async getMany(keys: string[]): Promise<(string | null)[]> {
    if (!keys.length) return [];
    try {
      return await this.redis.mget(...keys);
    } catch (error) {
      console.error('[RedisCache] Get Error:', error);
      return keys.map(() => null);
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.setMany([[key, value]]);
  }

  async setMany(entries: [string, string][]): Promise<void> {
    if (!entries.length) return;
    try {
      const pipeline = this.redis.pipeline();
      for (const [key, value] of entries) {
        if (this.ttl > 0) pipeline.set(key, value, 'EX', this.ttl);
        else pipeline.set(key, value);
      }
      const results = await pipeline.exec();
      const failure = results?.find(([error]) => error)?.[0];
      if (failure) throw failure;
    } catch (error) {
      console.error('[RedisCache] Set Error:', error);
    }
  }

  async disconnect(): Promise<void> {
    // Disconnect immediately: shutdown must not wait for an unavailable Redis server.
    this.redis.disconnect();
  }
}
