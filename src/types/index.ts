/**
 * Translation style/register for tone control.
 * Helps the model produce more appropriate phrasing without hardcoded idiom mappings.
 */
export type TranslationStyle = 'formal' | 'neutral' | 'casual' | 'marketing' | 'technical';

export interface TranslationConfig {
  targetLang: string;
  sourceLang?: string; // Source language (default: 'en'). When targetLang === sourceLang, translation is bypassed.
  provider: AIProviderConfig | AIProvider;
  cache?: CacheConfig | TranslationCache;
  batching?: BatchingConfig;
  excludedTerms?: string[]; // Words/Phrases to never translate
  translationContext?: string; // High-level context (e.g. "Marketing site for B2B SaaS")
  /**
   * Optional glossary of preferred translations for specific phrases.
   * Helps avoid literal translations of idioms and tech jargon.
   * Example: { "on the fly": "fortløpende", "cutting-edge": "banebrytende" }
   */
  glossary?: Record<string, string>;
  /**
   * Optional style/register for the translation.
   * Controls the tone and formality of the output.
   * Default: 'neutral'
   */
  style?: TranslationStyle;
  /** Preserve source content on failure (default), or reject the operation. */
  errorMode?: 'fallback' | 'throw';
  /** Observe provider failures even when source-content fallback is enabled. */
  onError?: (error: Error) => void;
}

export interface BatchingConfig {
  /** Maximum unique strings per provider request (default 100). */
  maxTexts?: number;
  /** Target character budget per request (default 100000); oversized strings travel alone. */
  maxTotalChars?: number;
  /** Maximum simultaneous provider batches, and separately cache lookups, per translator (default 2). */
  concurrency?: number;
  /** Automatic translateText batching delay in milliseconds (default 50). */
  delayMs?: number;
}

export interface TranslationRequestOptions {
  signal?: AbortSignal;
  /** Use batch provider calls within translateBatchStream (default: streaming when available). */
  stream?: boolean;
}

export interface TranslationStreamResult {
  index: number;
  translation: string;
  cached: boolean;
}

export interface TranslationBatchResult {
  translations: Map<string, string>;
  cachedCount: number;
  translatedCount: number;
  failedCount: number;
  status: 'complete' | 'partial' | 'fallback';
  error?: Error;
}

export interface AIProviderConfig {
  type: 'openai' | 'anthropic' | 'google' | 'custom';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeout?: number; // ms
  /** Sampling temperature; default 0.1. Set null to use the model's default. */
  temperature?: number | null;
  /** Optional output budget, including reasoning tokens. Sent as max_completion_tokens. */
  maxCompletionTokens?: number;
  /** Reasoning effort; default 'none'. Supported values depend on the model and gateway. */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

export interface CacheConfig {
  type: 'memory' | 'redis' | 'sql';
  ttl?: number; // Time to live in seconds; zero disables expiry
  maxEntries?: number; // Memory cache capacity (default 10000)
  commandTimeout?: number; // Redis command timeout in milliseconds (default 1000)
  connectionString?: string; // For Redis/SQL
  keyPrefix?: string; // Optional namespace, default 'tstlai:'
}

export interface TranslateOptions {
  excludedTerms?: string[];
  context?: string;
  stream?: boolean;
}

export interface AIProvider {
  translate(
    texts: string[],
    targetLang: string,
    excludedTerms?: string[],
    context?: string,
    glossary?: Record<string, string>,
    style?: TranslationStyle,
    options?: TranslationRequestOptions,
  ): Promise<string[]>;

  /**
   * Stream translations one at a time.
   * Yields { index, translation } as each translation completes.
   */
  translateStream?(
    texts: string[],
    targetLang: string,
    excludedTerms?: string[],
    context?: string,
    glossary?: Record<string, string>,
    style?: TranslationStyle,
    options?: TranslationRequestOptions,
  ): AsyncGenerator<{ index: number; translation: string }>;

  /** Check if this provider supports streaming */
  supportsStreaming?(): boolean;

  getModelInfo(): { name: string; capabilities: string[] };
}

export interface TranslationCache {
  get(hash: string): Promise<string | null>;
  set(hash: string, translation: string): Promise<void>;
  getMany?(keys: string[]): Promise<(string | null)[]>;
  setMany?(entries: [string, string][]): Promise<void>;
  disconnect?(): Promise<void> | void;
}

export interface ProcessedPage {
  html: string;
  translatedCount: number;
  cachedCount: number;
  /** Text direction for the target language */
  dir: 'ltr' | 'rtl';
  /** Target language code */
  lang: string;
  status?: TranslationBatchResult['status'];
  failedCount?: number;
}
