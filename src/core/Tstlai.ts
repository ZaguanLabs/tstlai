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
  
  private static RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug']);

  constructor(config: TranslationConfig) {
    this.config = config;
    this.htmlProcessor = new HTMLProcessor();

    // Initialize Provider
    this.provider = this.initializeProvider(config.provider);

    // Initialize Cache
    this.cache = this.initializeCache(config.cache);
  }

  private initializeProvider(providerConfig: any): AIProvider {
    switch (providerConfig.type) {
      case 'openai':
        return new OpenAIProvider(
          providerConfig.apiKey,
          providerConfig.model,
          providerConfig.baseUrl
        );
      default:
        // Fallback / Custom
        return {
          translate: async (texts: string[], targetLang: string) => {
            return texts.map(t => `[MOCK ${targetLang}] ${t}`);
          },
          getModelInfo: () => ({ name: 'mock', capabilities: [] })
        };
    }
  }

  private initializeCache(cacheConfig?: any): TranslationCache {
    if (cacheConfig?.type === 'redis') {
      return new RedisCache(cacheConfig.connectionString, cacheConfig.ttl);
    }
    return new InMemoryCache(cacheConfig?.ttl);
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

    // 2. Check Cache
    const translations = new Map<string, string>();
    const cacheMisses: TextNodeRef[] = [];
    let cachedCount = 0;

    await Promise.all(textNodes.map(async (node) => {
      // Composite key: hash + targetLang
      // In a real DB, we might store by hash and have columns for langs, 
      // but for key-value store, we need a composite key.
      const cacheKey = `${node.hash}:${targetLang}`;
      const cachedText = await this.cache.get(cacheKey);

      if (cachedText) {
        translations.set(node.hash, cachedText);
        cachedCount++;
      } else {
        // Avoid duplicate requests for same text in same page
        if (!cacheMisses.find(m => m.hash === node.hash)) {
          cacheMisses.push(node);
        }
      }
    }));

    // 3. Translate Misses
    let translatedCount = 0;
    if (cacheMisses.length > 0) {
      const textsToTranslate = cacheMisses.map(n => n.text);
      
      try {
        const translatedTexts = await this.provider.translate(textsToTranslate, targetLang);
        
        // Map back to nodes and update cache
        cacheMisses.forEach(async (node, index) => {
          const translation = translatedTexts[index];
          if (translation) {
            translations.set(node.hash, translation);
            const cacheKey = `${node.hash}:${targetLang}`;
            await this.cache.set(cacheKey, translation);
          }
        });
        translatedCount = cacheMisses.length;
      } catch (error) {
        console.error('Translation failed:', error);
        // Fallback: Keep original text for failed translations
      }
    }

    // 4. Reconstruct
    this.htmlProcessor.applyTranslations(textNodes, translations);

    // 5. Set Page Attributes (lang, dir)
    const langCode = targetLang.split('_')[0].toLowerCase();
    const isRtl = Tstlai.RTL_LANGUAGES.has(langCode);
    this.htmlProcessor.setPageAttributes(root, targetLang, isRtl ? 'rtl' : 'ltr');

    return {
      html: root.toString(),
      translatedCount,
      cachedCount
    };
  }
}