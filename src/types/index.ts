/**
 * Translation style/register for tone control.
 * Helps the model produce more appropriate phrasing without hardcoded idiom mappings.
 */
export type TranslationStyle = 'formal' | 'neutral' | 'casual' | 'marketing' | 'technical';

export interface TranslationConfig {
  targetLang: string;
  sourceLang?: string; // Source language (default: 'en'). When targetLang === sourceLang, translation is bypassed.
  provider: AIProviderConfig;
  cache?: CacheConfig;
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
  ): AsyncGenerator<{ index: number; translation: string }>;

  /** Check if this provider supports streaming */
  supportsStreaming?(): boolean;

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
  /** Text direction for the target language */
  dir: 'ltr' | 'rtl';
  /** Target language code */
  lang: string;
}
