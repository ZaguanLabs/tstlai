import * as crypto from 'crypto';
import {
  AIProvider,
  TranslationConfig,
  TranslationCache,
  ProcessedPage,
  TranslationStyle,
} from '../types';
import { OpenAIProvider } from '../providers/OpenAIProvider';
import { HTMLProcessor, TextNodeRef } from './HTMLProcessor';
import { InMemoryCache } from './Cache';
import { RedisCache } from './RedisCache';

export class Tstlai {
  private config: TranslationConfig;
  private provider: AIProvider;
  private cache: TranslationCache;
  private htmlProcessor: HTMLProcessor;
  private excludedTerms: string[] = [];
  private sourceLang: string;

  // Batching queue for translateText
  private batchQueue: {
    text: string;
    hash: string;
    targetLang?: string;
    resolve: (val: string) => void;
    reject: (err: any) => void;
  }[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 50; // ms

  private static RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug']);

  constructor(config: TranslationConfig) {
    this.config = config;
    this.htmlProcessor = new HTMLProcessor();

    // Initialize Provider
    this.provider = this.initializeProvider(config.provider);

    // Initialize Cache
    this.cache = this.initializeCache(config.cache);

    // Initialize Excluded Terms
    const envTerms = process.env.TSTLAI_EXCLUDED_TEXT
      ? process.env.TSTLAI_EXCLUDED_TEXT.split(',')
      : [];
    const configTerms = config.excludedTerms || [];
    this.excludedTerms = [...new Set([...configTerms, ...envTerms])]
      .map((t) => t.trim())
      .filter(Boolean);

    // Initialize Source Language (default: 'en')
    this.sourceLang = config.sourceLang || 'en';
  }

  /**
   * Check if the target language matches the source language.
   * When true, translation can be bypassed.
   */
  isSourceLang(targetLangOverride?: string): boolean {
    const targetLang = targetLangOverride || this.config.targetLang;
    // Normalize: compare base language codes (e.g., 'en-US' -> 'en')
    const normalizedTarget = targetLang.split(/[-_]/)[0].toLowerCase();
    const normalizedSource = this.sourceLang.split(/[-_]/)[0].toLowerCase();
    return normalizedTarget === normalizedSource;
  }

  /** Get the AI provider instance */
  getProvider(): AIProvider {
    return this.provider;
  }

  /** Get the target language */
  getTargetLang(): string {
    return this.config.targetLang;
  }

  /** Get excluded terms */
  getExcludedTerms(): string[] {
    return this.excludedTerms;
  }

  /** Get translation context */
  getContext(): string | undefined {
    return this.config.translationContext;
  }

  /** Get glossary of preferred translations */
  getGlossary(): Record<string, string> | undefined {
    return this.config.glossary;
  }

  /** Get translation style/register */
  getStyle(): TranslationStyle | undefined {
    return this.config.style;
  }

  /**
   * Check if the target language uses right-to-left text direction.
   * Useful for setting dir="rtl" on HTML elements.
   *
   * @param targetLangOverride - Optional target language override
   * @returns true if the language is RTL (Arabic, Hebrew, Persian, Urdu, etc.)
   */
  isRtl(targetLangOverride?: string): boolean {
    const targetLang = targetLangOverride || this.config.targetLang;
    const langCode = targetLang.split(/[-_]/)[0].toLowerCase();
    return Tstlai.RTL_LANGUAGES.has(langCode);
  }

  /**
   * Get the text direction for the target language.
   *
   * @param targetLangOverride - Optional target language override
   * @returns 'rtl' or 'ltr'
   */
  getDir(targetLangOverride?: string): 'ltr' | 'rtl' {
    return this.isRtl(targetLangOverride) ? 'rtl' : 'ltr';
  }

  /** Cache a translation directly */
  async cacheTranslation(
    hash: string,
    translation: string,
    targetLangOverride?: string,
  ): Promise<void> {
    const targetLang = targetLangOverride || this.config.targetLang;
    const cacheKey = `${hash}:${targetLang}`;
    await this.cache.set(cacheKey, translation);
  }

  /** Get a cached translation */
  async getCachedTranslation(hash: string, targetLangOverride?: string): Promise<string | null> {
    const targetLang = targetLangOverride || this.config.targetLang;
    const cacheKey = `${hash}:${targetLang}`;
    return this.cache.get(cacheKey);
  }

  private initializeProvider(providerConfig: any): AIProvider {
    switch (providerConfig.type) {
      case 'openai':
        return new OpenAIProvider(
          providerConfig.apiKey,
          providerConfig.model,
          providerConfig.baseUrl,
          providerConfig.timeout,
        );
      default:
        // Fallback / Custom
        return {
          translate: async (texts: string[], targetLang: string) => {
            return texts.map((t) => `[MOCK ${targetLang}] ${t}`);
          },
          getModelInfo: () => ({ name: 'mock', capabilities: [] }),
        };
    }
  }

  private initializeCache(cacheConfig?: any): TranslationCache {
    if (cacheConfig?.type === 'redis') {
      return new RedisCache(cacheConfig.connectionString, cacheConfig.ttl, cacheConfig.keyPrefix);
    }
    return new InMemoryCache(cacheConfig?.ttl);
  }

  /**
   * Translate a single text string with automatic batching.
   *
   * @param text - Text to translate
   * @param targetLangOverride - Optional target language override
   * @param context - Optional context hint for disambiguation (e.g., "button: save file")
   *
   * @example
   * // Without context
   * await tstlai.translateText("Save");
   *
   * // With context for disambiguation
   * await tstlai.translateText("Save", undefined, "button: save file to disk");
   * await tstlai.translateText("Post", "es_ES", "verb: publish content");
   */
  async translateText(
    text: string,
    targetLangOverride?: string,
    context?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Include context in the text for the AI, will be stripped from output
      const textWithContext = context ? `${text.trim()} {{__ctx__:${context}}}` : text.trim();
      // Hash is based on original text only (context doesn't affect caching)
      const hash = crypto.createHash('sha256').update(text.trim()).digest('hex');

      this.batchQueue.push({
        text: textWithContext,
        hash,
        targetLang: targetLangOverride,
        resolve,
        reject,
      });

      if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => this.flushBatch(), this.BATCH_DELAY);
      }
    });
  }

  /**
   * Process queued translation requests
   */
  private async flushBatch() {
    const queue = [...this.batchQueue];
    this.batchQueue = [];
    this.batchTimeout = null;

    if (queue.length === 0) return;

    // Group by target language
    const byLang = new Map<string, typeof queue>();
    const defaultLang = this.config.targetLang;

    queue.forEach((item) => {
      const lang = item.targetLang || defaultLang;
      if (!byLang.has(lang)) byLang.set(lang, []);
      byLang.get(lang)!.push(item);
    });

    // Process each language group
    for (const [lang, items] of byLang.entries()) {
      try {
        // Deduplicate items for the API call
        const uniqueItems = Array.from(new Map(items.map((item) => [item.hash, item])).values());

        const { translations } = await this.translateBatch(
          uniqueItems.map(({ text, hash }) => ({ text, hash })),
          lang,
        );

        // Resolve all promises (strip any leaked context markers)
        items.forEach((item) => {
          let translation = translations.get(item.hash) || item.text;
          // Remove context markers that might have leaked through
          translation = translation.replace(/\s*\{\{__ctx__:[^}]+\}\}\s*/g, '');
          item.resolve(translation);
        });
      } catch (error) {
        // Fail all items in this group
        items.forEach((item) => item.reject(error));
      }
    }
  }

  /**
   * Core translation pipeline: Check cache -> Translate Misses -> Update Cache
   */
  async translateBatch(
    items: { text: string; hash: string }[],
    targetLangOverride?: string,
  ): Promise<{ translations: Map<string, string>; cachedCount: number; translatedCount: number }> {
    const targetLang = targetLangOverride || this.config.targetLang;
    const translations = new Map<string, string>();
    const cacheMisses: { text: string; hash: string }[] = [];
    let cachedCount = 0;
    let translatedCount = 0;

    // 1. Check Cache
    // Use a Map to track cache results while preserving original order
    const cacheResults = await Promise.all(
      items.map(async (item) => {
        const cacheKey = `${item.hash}:${targetLang}`;
        const cachedText = await this.cache.get(cacheKey);
        return { item, cachedText };
      }),
    );

    // Process results in original order to maintain deterministic cacheMisses order
    const seenHashes = new Set<string>();
    for (const { item, cachedText } of cacheResults) {
      if (cachedText) {
        translations.set(item.hash, cachedText);
        cachedCount++;
      } else {
        if (!seenHashes.has(item.hash)) {
          seenHashes.add(item.hash);
          cacheMisses.push(item);
        }
      }
    }

    // 2. Translate Misses
    if (cacheMisses.length > 0) {
      const textsToTranslate = cacheMisses.map((n) => n.text);

      try {
        const translatedTexts = await this.provider.translate(
          textsToTranslate,
          targetLang,
          this.excludedTerms,
          this.config.translationContext,
          this.config.glossary,
          this.config.style,
        );

        // Properly await all cache writes
        await Promise.all(
          cacheMisses.map(async (item, index) => {
            const translation = translatedTexts[index];
            if (translation) {
              translations.set(item.hash, translation);
              const cacheKey = `${item.hash}:${targetLang}`;
              await this.cache.set(cacheKey, translation);
            }
          }),
        );
        translatedCount = cacheMisses.length;
      } catch (error) {
        console.error('Translation failed:', error);
      }
    }

    return { translations, cachedCount, translatedCount };
  }

  /**
   * Main processing function: Takes HTML, translates it, returns new HTML
   */
  async process(html: string): Promise<ProcessedPage> {
    const targetLang = this.config.targetLang;

    // 1. Parse and Extract
    const root = this.htmlProcessor.parse(html);
    const textNodes: TextNodeRef[] = this.htmlProcessor.extractTextNodes(root);

    if (textNodes.length === 0) {
      return {
        html,
        translatedCount: 0,
        cachedCount: 0,
        dir: this.getDir(),
        lang: targetLang,
      };
    }

    // 2. Translate Batch
    // TextNodeRef already has text and hash
    const { translations, cachedCount, translatedCount } = await this.translateBatch(textNodes);

    // 3. Reconstruct
    this.htmlProcessor.applyTranslations(textNodes, translations);

    // 4. Set Page Attributes (lang, dir)
    const langCode = targetLang.split('_')[0].toLowerCase();
    const isRtl = Tstlai.RTL_LANGUAGES.has(langCode);
    this.htmlProcessor.setPageAttributes(root, targetLang, isRtl ? 'rtl' : 'ltr');

    return {
      html: root.toString(),
      translatedCount,
      cachedCount,
      dir: isRtl ? 'rtl' : 'ltr',
      lang: targetLang,
    };
  }
}
