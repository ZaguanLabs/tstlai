export interface TranslationConfig {
  targetLang: string;
  sourceLang?: string; // Source language (default: 'en'). When targetLang === sourceLang, translation is bypassed.
  provider: AIProviderConfig;
  cache?: CacheConfig;
  excludedTerms?: string[]; // Words/Phrases to never translate
  translationContext?: string; // High-level context (e.g. "Marketing site for B2B SaaS")
}

export interface AIProviderConfig {
  type: 'openai' | 'anthropic' | 'google' | 'custom';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeout?: number; // ms
}

export interface CacheConfig {
  type: 'memory' | 'redis' | 'sql';
  ttl?: number; // Time to live in seconds
  connectionString?: string; // For Redis/SQL
  keyPrefix?: string; // Optional namespace, default 'tstlai:'
}

export interface AIProvider {
  translate(
    texts: string[],
    targetLang: string,
    excludedTerms?: string[],
    context?: string,
  ): Promise<string[]>;
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
