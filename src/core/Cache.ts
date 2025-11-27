import { TranslationCache } from '../types';

export class InMemoryCache implements TranslationCache {
  private cache: Map<string, string>;
  private ttl: number;
  private timestamps: Map<string, number>;

  constructor(ttl: number = 3600) {
    this.cache = new Map();
    this.timestamps = new Map();
    this.ttl = ttl * 1000; // Convert to ms
  }

  async get(hash: string): Promise<string | null> {
    const timestamp = this.timestamps.get(hash);
    if (!timestamp) return null;

    if (Date.now() - timestamp > this.ttl) {
      this.cache.delete(hash);
      this.timestamps.delete(hash);
      return null;
    }

    return this.cache.get(hash) || null;
  }

  async set(hash: string, translation: string): Promise<void> {
    this.cache.set(hash, translation);
    this.timestamps.set(hash, Date.now());
  }
}
