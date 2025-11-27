export interface TranslationConfig {
  targetLang: string;
  provider: AIProviderConfig;
  cache?: CacheConfig;
}

export interface AIProviderConfig {
  type: 'openai' | 'anthropic' | 'google' | 'custom';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface CacheConfig {
  type: 'memory' | 'redis' | 'sql';
  ttl?: number; // Time to live in seconds
  connectionString?: string; // For Redis/SQL
}

export interface AIProvider {
  translate(texts: string[], targetLang: string): Promise<string[]>;
  getModelInfo(): { name: string; capabilities: string[] };
}

export interface TranslationCache {
  get(hash: string): Promise<string | null>;
  set(hash: string, translation: string): Promise<void>;
}

export interface ProcessedPage {
  html: string;
  translatedCount: number;
  cachedCount: number;
}