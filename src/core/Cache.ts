import { TranslationCache } from '../types';

/** Bounded LRU cache. Reading refreshes recency, never the expiry time. */
export class InMemoryCache implements TranslationCache {
  private entries = new Map<string, { value: string; expiresAt: number }>();
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(
    private ttl = 3600,
    private maxEntries = 10000,
  ) {
    if (!Number.isFinite(ttl) || ttl < 0) throw new Error('Invalid cache.ttl');
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1)
      throw new Error('Invalid cache.maxEntries');
    if (ttl > 0) {
      this.timer = setInterval(() => this.prune(), Math.max(1, Math.min(ttl * 1000, 60000)));
      this.timer.unref?.();
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: string): Promise<void> {
    if (this.closed) return;
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries)
      this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, {
      value,
      expiresAt: this.ttl === 0 ? Infinity : Date.now() + this.ttl * 1000,
    });
  }

  getMany(keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  async setMany(entries: [string, string][]): Promise<void> {
    await Promise.all(entries.map(([key, value]) => this.set(key, value)));
  }

  disconnect(): void {
    this.closed = true;
    clearInterval(this.timer);
    this.entries.clear();
  }
}
