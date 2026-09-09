import * as crypto from 'crypto';
import { TranslationPipeline, abortable, abortError } from './TranslationPipeline';
import {
  AIProvider,
  TranslationConfig,
  TranslationCache,
  ProcessedPage,
  TranslationStyle,
  TranslationBatchResult,
  TranslationRequestOptions,
  TranslationStreamResult,
} from '../types';
import { OpenAIProvider } from '../providers/OpenAIProvider';
import { HTMLProcessor, TextNodeRef } from './HTMLProcessor';
import { InMemoryCache } from './Cache';
import { RedisCache } from './RedisCache';
import { normalizeLocaleCode } from '../languages';
import { preserveWhitespace, stripContextMarkers } from './text';

export class Tstlai {
  private config: TranslationConfig;
  private provider: AIProvider;
  private cache: TranslationCache;
  private htmlProcessor: HTMLProcessor;
  private excludedTerms: string[] = [];
  private sourceLang: string;
  private cacheNamespace: string;
  private pipeline: TranslationPipeline;
  private closing?: Promise<void>;

  // Batching queue for translateText
  private batchQueue: {
    text: string;
    sourceText: string;
    hash: string;
    targetLang?: string;
    signal?: AbortSignal;
    resolve: (val: string) => void;
    reject: (err: any) => void;
  }[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;

  private static RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug']);

  constructor(config: TranslationConfig) {
    this.config = {
      ...config,
      glossary: config.glossary ? { ...config.glossary } : undefined,
    };
    this.htmlProcessor = new HTMLProcessor();

    this.pipeline = new TranslationPipeline(
      {
        read: async (keys) => {
          if (this.cache.getMany) return this.cache.getMany(keys);
          const values: (string | null)[] = [];
          for (let i = 0; i < keys.length; i += 16) {
            values.push(
              ...(await Promise.all(keys.slice(i, i + 16).map((key) => this.cache.get(key)))),
            );
          }
          return values;
        },
        write: async (entries) => {
          if (this.cache.setMany) return this.cache.setMany(entries);
          for (let i = 0; i < entries.length; i += 16) {
            await Promise.all(
              entries.slice(i, i + 16).map(([key, value]) => this.cache.set(key, value)),
            );
          }
        },
        translate: (texts, locale, stream, signal, progress) =>
          this.requestProvider(texts, locale, stream, signal, progress),
      },
      config.batching,
    );

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
    const providerConfig = 'type' in config.provider ? config.provider : undefined;
    // Version the translation identity so older context-insensitive entries are not reused.
    this.cacheNamespace =
      'v2:' +
      crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            source: normalizeLocaleCode(this.sourceLang),
            model: this.provider.getModelInfo().name,
            baseUrl: providerConfig?.baseUrl || process.env.OPENAI_BASE_URL || '',
            context: config.translationContext || '',
            glossary: Object.entries(this.config.glossary || {}).sort(([a], [b]) =>
              a.localeCompare(b),
            ),
            style: config.style || 'neutral',
            exclusions: [...this.excludedTerms].sort(),
            temperature:
              providerConfig?.temperature === undefined ? 0.1 : providerConfig?.temperature,
            reasoningEffort: providerConfig?.reasoningEffort || 'none',
          }),
        )
        .digest('hex');
  }

  /**
   * Check if the target language matches the source language.
   * When true, translation can be bypassed.
   */
  isSourceLang(targetLangOverride?: string): boolean {
    const targetLang = targetLangOverride || this.config.targetLang;
    return normalizeLocaleCode(targetLang) === normalizeLocaleCode(this.sourceLang);
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
    return [...this.excludedTerms];
  }

  /** Get translation context */
  getContext(): string | undefined {
    return this.config.translationContext;
  }

  /** Get glossary of preferred translations */
  getGlossary(): Record<string, string> | undefined {
    return this.config.glossary ? { ...this.config.glossary } : undefined;
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
    const cacheKey = this.cacheKey(hash, targetLang);
    await this.cache.set(cacheKey, translation);
  }

  /** Get a cached translation */
  async getCachedTranslation(hash: string, targetLangOverride?: string): Promise<string | null> {
    const targetLang = targetLangOverride || this.config.targetLang;
    const cacheKey = this.cacheKey(hash, targetLang);
    return this.cache.get(cacheKey);
  }

  private cacheKey(hash: string, targetLang: string): string {
    return `${this.cacheNamespace}:${hash}:${normalizeLocaleCode(targetLang)}`;
  }

  /** Report a failure without disabling source-content fallback if an observer throws. */
  reportError(error: Error): void {
    console.error('Translation failed:', error);
    try {
      this.config.onError?.(error);
    } catch (observerError) {
      console.error('Translation error observer failed:', observerError);
    }
  }

  private initializeProvider(provider: TranslationConfig['provider']): AIProvider {
    if (!provider || typeof provider !== 'object')
      throw new Error('A translation provider is required');
    if ('translate' in provider) {
      if (typeof provider.translate !== 'function' || typeof provider.getModelInfo !== 'function') {
        throw new Error('Custom providers must implement translate() and getModelInfo()');
      }
      return provider;
    }
    if (provider.type !== 'openai') {
      throw new Error(
        `Unsupported provider type "${provider.type}". Use type "openai" for an OpenAI-compatible gateway, or pass an AIProvider instance.`,
      );
    }
    return new OpenAIProvider(
      provider.apiKey,
      provider.model,
      provider.baseUrl,
      provider.timeout,
      provider,
    );
  }

  private initializeCache(cache?: TranslationConfig['cache']): TranslationCache {
    if (cache && ('get' in cache || 'set' in cache)) {
      if (
        !('get' in cache) ||
        !('set' in cache) ||
        typeof cache.get !== 'function' ||
        typeof cache.set !== 'function'
      ) {
        throw new Error('Custom caches must implement get() and set()');
      }
      return cache as TranslationCache;
    }
    if (cache?.type === 'redis') {
      return new RedisCache(
        cache.connectionString,
        cache.ttl,
        cache.keyPrefix,
        cache.commandTimeout,
      );
    }
    if (cache && cache.type !== 'memory') {
      throw new Error(
        `Unsupported cache type "${cache.type}". Use memory, redis, or pass a TranslationCache instance.`,
      );
    }
    return new InMemoryCache(cache?.ttl, cache?.maxEntries);
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
    options: TranslationRequestOptions = {},
  ): Promise<string> {
    this.pipeline.assertOpen(options.signal);
    if (this.isSourceLang(targetLangOverride) || !text.trim()) return stripContextMarkers(text);
    return new Promise((resolve, reject) => {
      // Include context in the text for the AI, will be stripped from output
      const textWithContext = context ? `${text.trim()} {{__ctx__:${context}}}` : text.trim();
      const hash = crypto.createHash('sha256').update(textWithContext).digest('hex');

      const cancel = () => reject(abortError());
      options.signal?.addEventListener('abort', cancel, { once: true });
      const cleanup = () => options.signal?.removeEventListener('abort', cancel);
      this.batchQueue.push({
        text: textWithContext,
        sourceText: text,
        hash,
        targetLang: targetLangOverride,
        signal: options.signal,
        resolve: (value) => {
          cleanup();
          resolve(value);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      });

      if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => this.flushBatch(), this.pipeline.limits.delayMs);
      }
    });
  }

  /**
   * Process queued translation requests
   */
  private async flushBatch() {
    const queue = this.batchQueue.filter((item) => !item.signal?.aborted);
    this.batchQueue = [];
    this.batchTimeout = null;

    if (queue.length === 0) return;

    // Group by target language
    const byLang = new Map<string, typeof queue>();
    const defaultLang = this.config.targetLang;

    queue.forEach((item) => {
      const lang = normalizeLocaleCode(item.targetLang || defaultLang);
      if (!byLang.has(lang)) byLang.set(lang, []);
      byLang.get(lang)!.push(item);
    });

    // Process each language group
    await Promise.all(
      [...byLang].map(async ([lang, items]) => {
        const controller = new AbortController();
        const cancel = () => {
          if (items.every((item) => item.signal?.aborted)) controller.abort();
        };
        items.forEach((item) => item.signal?.addEventListener('abort', cancel, { once: true }));
        cancel();
        try {
          // Deduplicate items for the API call
          const uniqueItems = Array.from(new Map(items.map((item) => [item.hash, item])).values());

          const { translations } = await this.translateBatch(
            uniqueItems.map(({ text, hash }) => ({ text, hash })),
            lang,
            { signal: controller.signal },
          );

          // Resolve all promises (strip any leaked context markers)
          items.forEach((item) => {
            const translation = translations.get(item.hash) ?? item.sourceText;
            item.resolve(preserveWhitespace(item.sourceText, stripContextMarkers(translation)));
          });
        } catch (error) {
          // Fail all items in this group
          items.forEach((item) => item.reject(error));
        } finally {
          items.forEach((item) => item.signal?.removeEventListener('abort', cancel));
        }
      }),
    );
  }

  private async requestProvider(
    texts: string[],
    locale: string,
    stream: boolean,
    signal: AbortSignal,
    progress: (index: number, translation: string) => void,
  ): Promise<string[]> {
    const args = [
      texts,
      locale,
      this.excludedTerms,
      this.config.translationContext,
      this.config.glossary,
      this.config.style,
      { signal },
    ] as const;
    let translations: string[];
    if (stream && this.provider.translateStream && (this.provider.supportsStreaming?.() ?? true)) {
      const results = new Map<number, string>();
      const iterator = this.provider.translateStream(...args);
      try {
        while (true) {
          const next = await abortable(iterator.next(), signal);
          if (next.done) break;
          const { index, translation } = next.value;
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= texts.length ||
            results.has(index) ||
            typeof translation !== 'string'
          ) {
            throw new Error('Invalid streamed translation');
          }
          const value = stripContextMarkers(translation);
          results.set(index, value);
          progress(index, value);
        }
        if (results.size !== texts.length) throw new Error('Incomplete translation stream');
        translations = texts.map((_, index) => results.get(index)!);
      } finally {
        // A custom provider may ignore the signal. Do not let its pending next() block shutdown.
        if (signal.aborted) void iterator.return(undefined).catch(() => {});
        else await iterator.return(undefined);
      }
    } else {
      translations = await abortable(this.provider.translate(...args), signal);
    }
    if (
      !Array.isArray(translations) ||
      translations.length !== texts.length ||
      Array.from(translations).some((text) => typeof text !== 'string')
    ) {
      throw new Error('Invalid translation response: expected one string per input');
    }
    return translations.map(stripContextMarkers);
  }

  /** Shared, bounded cache/provider pipeline. Only validated results enter batch responses. */
  async translateBatch(
    items: { text: string; hash: string }[],
    targetLangOverride?: string,
    options: TranslationRequestOptions = {},
  ): Promise<TranslationBatchResult> {
    this.pipeline.assertOpen(options.signal);
    const targetLang = targetLangOverride || this.config.targetLang;
    const translations = new Map<string, string>();
    let cachedCount = 0;
    let translatedCount = 0;
    let failure: Error | undefined;
    if (this.isSourceLang(targetLang)) {
      for (const item of items) translations.set(item.hash, stripContextMarkers(item.text));
    } else {
      const keyed = items.map((item) => ({ ...item, key: this.cacheKey(item.hash, targetLang) }));
      const byKey = new Map<string, typeof keyed>();
      for (const item of keyed) {
        const matches = byKey.get(item.key);
        if (matches) matches.push(item);
        else byKey.set(item.key, [item]);
      }
      const errors = new Set<Error>();
      for await (const event of this.pipeline.run(keyed, targetLang, false, options.signal)) {
        if ('error' in event) {
          if (event.error.name === 'AbortError') throw event.error;
          failure ??= event.error;
          if (!errors.has(event.error)) {
            errors.add(event.error);
            this.reportError(event.error);
          }
        } else if (event.committed) {
          const matches = byKey.get(event.key)!;
          for (const item of matches) translations.set(item.hash, event.translation);
          if (event.cached) cachedCount += matches.length;
          else translatedCount++;
        }
      }
      if (failure && this.config.errorMode === 'throw') throw failure;
    }
    const failedCount = items.filter((item) => !translations.has(item.hash)).length;
    return {
      translations,
      cachedCount,
      translatedCount,
      failedCount,
      status: failedCount === 0 ? 'complete' : translations.size > 0 ? 'partial' : 'fallback',
      ...(failure ? { error: failure } : {}),
    };
  }

  /** Progressive results; completion validates the entire stream. Failures always reject. */
  async *translateBatchStream(
    items: { text: string; hash: string }[],
    targetLangOverride?: string,
    options: TranslationRequestOptions = {},
  ): AsyncGenerator<TranslationStreamResult> {
    this.pipeline.assertOpen(options.signal);
    const locale = targetLangOverride || this.config.targetLang;
    if (this.isSourceLang(locale)) {
      for (const [index, item] of items.entries()) {
        this.pipeline.assertOpen(options.signal);
        yield { index, translation: stripContextMarkers(item.text), cached: false };
      }
      return;
    }
    const keyed = items.map((item) => ({ ...item, key: this.cacheKey(item.hash, locale) }));
    const indices = new Map<string, number[]>();
    keyed.forEach((item, index) => {
      const matches = indices.get(item.key);
      if (matches) matches.push(index);
      else indices.set(item.key, [index]);
    });
    const emitted = new Set<string>();
    for await (const event of this.pipeline.run(
      keyed,
      locale,
      options.stream !== false,
      options.signal,
    )) {
      if ('error' in event) {
        if (event.error.name !== 'AbortError') this.reportError(event.error);
        throw event.error;
      }
      if (emitted.has(event.key)) continue;
      emitted.add(event.key);
      for (const index of indices.get(event.key)!) {
        if (options.signal?.aborted) throw abortError();
        yield { index, translation: event.translation, cached: event.cached };
      }
    }
  }

  /** Abort pending work and release cache resources. Safe to call repeatedly. */
  close(): Promise<void> {
    if (!this.closing) {
      if (this.batchTimeout) clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
      for (const item of this.batchQueue) item.reject(abortError());
      this.batchQueue = [];
      this.closing = this.pipeline.close().then(() => this.cache.disconnect?.());
    }
    return this.closing;
  }

  /**
   * Main processing function: Takes HTML, translates it, returns new HTML
   */
  async process(html: string, options: TranslationRequestOptions = {}): Promise<ProcessedPage> {
    this.pipeline.assertOpen(options.signal);
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
    const { translations, cachedCount, translatedCount, status, failedCount } =
      await this.translateBatch(textNodes, undefined, options);

    // 3. Reconstruct
    this.htmlProcessor.applyTranslations(textNodes, translations);

    // 4. Set Page Attributes (lang, dir)
    const effectiveLang = status === 'fallback' ? this.sourceLang : targetLang;
    const isRtl = this.isRtl(effectiveLang);
    this.htmlProcessor.setPageAttributes(root, effectiveLang, isRtl ? 'rtl' : 'ltr');

    return {
      html: root.toString(),
      translatedCount,
      cachedCount,
      dir: isRtl ? 'rtl' : 'ltr',
      lang: effectiveLang,
      status,
      failedCount,
    };
  }
}
