import * as crypto from 'crypto';
import { AIProvider, TranslationConfig, TranslationCache, ProcessedPage } from '../types';
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
   * Translate a single text string
   */
  async translateText(text: string, targetLangOverride?: string): Promise<string> {
    const hash = crypto.createHash('sha256').update(text.trim()).digest('hex');
    const result = await this.translateBatch([{ text: text.trim(), hash }], targetLangOverride);
    return result.translations.get(hash) || text;
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
    await Promise.all(
      items.map(async (item) => {
        const cacheKey = `${item.hash}:${targetLang}`;
        const cachedText = await this.cache.get(cacheKey);

        if (cachedText) {
          translations.set(item.hash, cachedText);
          cachedCount++;
        } else {
          if (!cacheMisses.find((m) => m.hash === item.hash)) {
            cacheMisses.push(item);
          }
        }
      }),
    );

    // 2. Translate Misses
    if (cacheMisses.length > 0) {
      const textsToTranslate = cacheMisses.map((n) => n.text);

      try {
        const translatedTexts = await this.provider.translate(
          textsToTranslate,
          targetLang,
          this.excludedTerms,
          this.config.translationContext,
        );

        cacheMisses.forEach(async (item, index) => {
          const translation = translatedTexts[index];
          if (translation) {
            translations.set(item.hash, translation);
            const cacheKey = `${item.hash}:${targetLang}`;
            await this.cache.set(cacheKey, translation);
          }
        });
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
      return { html, translatedCount: 0, cachedCount: 0 };
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
    };
  }
}
