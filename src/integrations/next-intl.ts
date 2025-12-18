import * as crypto from 'crypto';
import { Tstlai } from '../core/Tstlai';

interface FlatMessage {
  key: string;
  text: string;
  hash: string;
}

// Helper to flatten object to dot notation
const flatten = (obj: any, prefix = ''): Record<string, string> => {
  return Object.keys(obj).reduce((acc: any, k) => {
    const pre = prefix.length ? prefix + '.' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      Object.assign(acc, flatten(obj[k], pre + k));
    } else if (typeof obj[k] === 'string') {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
};

// Helper to set value by dot path
const setByPath = (obj: any, path: string, value: any) => {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
};

export const createNextIntlAdapter = (translator: Tstlai, sourceMessages: Record<string, any>) => {
  return {
    /**
     * Async replacement for next-intl's getTranslations.
     * Translates the entire sourceMessages object to the target locale JIT.
     */
    getTranslations: async (locale: string) => {
      const flat = flatten(sourceMessages);
      const entries = Object.entries(flat);

      const batchItems = entries.map(([_, text]) => ({
        text: text as string,
        hash: crypto
          .createHash('sha256')
          .update((text as string).trim())
          .digest('hex'),
      }));

      // Translate all messages in one batch
      const { translations } = await translator.translateBatch(batchItems, locale);

      const resultMessages = {};
      entries.forEach(([key, text], index) => {
        const hash = batchItems[index].hash;
        const translatedText = translations.get(hash) || text;
        setByPath(resultMessages, key, translatedText);
      });

      // Return a t function compatible with next-intl
      const t = (key: string) => {
        const parts = key.split('.');
        let current: any = resultMessages;
        for (const part of parts) {
          if (current === undefined) break;
          current = current[part];
        }
        return current !== undefined ? current : key;
      };

      // Expose raw messages if needed by other tools
      (t as any).messages = resultMessages;

      return t;
    },

    /**
     * Helper to get raw messages object for Client Component hydration.
     */
    getMessages: async (locale: string) => {
      const flat = flatten(sourceMessages);
      const entries = Object.entries(flat);

      const batchItems = entries.map(([_, text]) => ({
        text: text as string,
        hash: crypto
          .createHash('sha256')
          .update((text as string).trim())
          .digest('hex'),
      }));

      const { translations } = await translator.translateBatch(batchItems, locale);

      const resultMessages = {};
      entries.forEach(([key, text], index) => {
        const hash = batchItems[index].hash;
        const translatedText = translations.get(hash) || text;
        setByPath(resultMessages, key, translatedText);
      });

      return resultMessages;
    },

    // Stub for other next-intl exports
    unstable_setRequestLocale: (_locale: string) => {
      // noop
    },
  };
};

/**
 * Create a streaming adapter for next-intl that yields partial message objects
 * as translations complete. Designed for React 19 Suspense streaming SSR.
 *
 * @example
 * ```tsx
 * // src/lib/translator.ts
 * import { createStreamingNextIntlAdapter } from 'tstlai/integrations/next-intl';
 * const adapter = createStreamingNextIntlAdapter(translator, enMessages);
 * export const getStreamingMessages = adapter.getStreamingMessages;
 *
 * // src/app/[locale]/layout.tsx
 * import { TstlaiSuspenseProvider } from 'tstlai/client';
 * import { getStreamingMessages } from '@/lib/translator';
 *
 * export default async function Layout({ children, params }) {
 *   const { locale } = await params;
 *   const messagesPromise = getStreamingMessages(locale);
 *
 *   return (
 *     <TstlaiSuspenseProvider
 *       locale={locale}
 *       fallbackMessages={enMessages}
 *       translatedMessages={messagesPromise}
 *     >
 *       {children}
 *     </TstlaiSuspenseProvider>
 *   );
 * }
 * ```
 */
export const createStreamingNextIntlAdapter = (
  translator: Tstlai,
  sourceMessages: Record<string, any>,
) => {
  // Pre-compute flat messages with hashes
  const flatEntries = Object.entries(flatten(sourceMessages));
  const flatMessages: FlatMessage[] = flatEntries.map(([key, text]) => ({
    key,
    text: text as string,
    hash: crypto
      .createHash('sha256')
      .update((text as string).trim())
      .digest('hex'),
  }));

  return {
    /**
     * Get messages as an async generator that yields partial objects.
     * Each yield contains the cumulative translated messages so far.
     */
    async *getMessagesStream(locale: string): AsyncGenerator<Record<string, any>> {
      const provider = translator.getProvider();
      const supportsStreaming =
        (provider.supportsStreaming && provider.supportsStreaming()) ||
        typeof provider.translateStream === 'function';

      // Start with source messages
      const resultMessages: Record<string, any> = JSON.parse(JSON.stringify(sourceMessages));

      // Check cache first and collect misses
      const cacheMisses: FlatMessage[] = [];
      const cachedResults: Map<string, string> = new Map();

      for (const item of flatMessages) {
        const cached = await translator.getCachedTranslation(item.hash, locale);
        if (cached) {
          cachedResults.set(item.hash, cached);
          setByPath(resultMessages, item.key, cached);
        } else {
          cacheMisses.push(item);
        }
      }

      // Yield with cached translations applied
      if (cachedResults.size > 0) {
        yield resultMessages;
      }

      // If all cached, we're done
      if (cacheMisses.length === 0) {
        return;
      }

      // If streaming not supported, fall back to batch
      if (!supportsStreaming || !provider.translateStream) {
        const batchItems = cacheMisses.map(({ text, hash }) => ({ text, hash }));
        const { translations } = await translator.translateBatch(batchItems, locale);

        for (const item of cacheMisses) {
          const translation = translations.get(item.hash);
          if (translation) {
            setByPath(resultMessages, item.key, translation);
          }
        }
        yield resultMessages;
        return;
      }

      // Stream translations
      const textsToTranslate = cacheMisses.map((item) => item.text);
      const streamGenerator = provider.translateStream(
        textsToTranslate,
        locale,
        translator.getExcludedTerms(),
        translator.getContext(),
        translator.getGlossary(),
        translator.getStyle(),
      );

      for await (const { index: streamIndex, translation } of streamGenerator) {
        const item = cacheMisses[streamIndex];
        if (item && translation) {
          // Cache immediately
          await translator.cacheTranslation(item.hash, translation, locale);
          // Update result
          setByPath(resultMessages, item.key, translation);
          // Yield progressive update
          yield resultMessages;
        }
      }
    },

    /**
     * Get messages as a Promise that resolves when all translations complete.
     * Uses streaming internally but returns final result.
     * Compatible with TstlaiSuspenseProvider's translatedMessages prop.
     */
    getStreamingMessages: async (locale: string): Promise<Record<string, any>> => {
      const provider = translator.getProvider();
      const supportsStreaming =
        (provider.supportsStreaming && provider.supportsStreaming()) ||
        typeof provider.translateStream === 'function';

      // Start with source messages
      const resultMessages: Record<string, any> = JSON.parse(JSON.stringify(sourceMessages));

      // Check cache first and collect misses
      const cacheMisses: FlatMessage[] = [];

      for (const item of flatMessages) {
        const cached = await translator.getCachedTranslation(item.hash, locale);
        if (cached) {
          setByPath(resultMessages, item.key, cached);
        } else {
          cacheMisses.push(item);
        }
      }

      // If all cached, return immediately
      if (cacheMisses.length === 0) {
        return resultMessages;
      }

      // If streaming not supported, fall back to batch
      if (!supportsStreaming || !provider.translateStream) {
        const batchItems = cacheMisses.map(({ text, hash }) => ({ text, hash }));
        const { translations } = await translator.translateBatch(batchItems, locale);

        for (const item of cacheMisses) {
          const translation = translations.get(item.hash);
          if (translation) {
            setByPath(resultMessages, item.key, translation);
          }
        }
        return resultMessages;
      }

      // Stream translations (but return final result)
      const textsToTranslate = cacheMisses.map((item) => item.text);
      const streamGenerator = provider.translateStream(
        textsToTranslate,
        locale,
        translator.getExcludedTerms(),
        translator.getContext(),
        translator.getGlossary(),
        translator.getStyle(),
      );

      for await (const { index: streamIndex, translation } of streamGenerator) {
        const item = cacheMisses[streamIndex];
        if (item && translation) {
          await translator.cacheTranslation(item.hash, translation, locale);
          setByPath(resultMessages, item.key, translation);
        }
      }

      return resultMessages;
    },

    /**
     * Create a streaming promise that works with React Suspense.
     * Returns a "thenable" that React can suspend on.
     */
    createStreamingPromise: (locale: string) => {
      let result: Record<string, any> | null = null;
      let error: Error | null = null;
      let promise: Promise<Record<string, any>> | null = null;

      const getPromise = () => {
        if (!promise) {
          promise = (async () => {
            const provider = translator.getProvider();
            const supportsStreaming =
              (provider.supportsStreaming && provider.supportsStreaming()) ||
              typeof provider.translateStream === 'function';

            const resultMessages: Record<string, any> = JSON.parse(JSON.stringify(sourceMessages));
            const cacheMisses: FlatMessage[] = [];

            for (const item of flatMessages) {
              const cached = await translator.getCachedTranslation(item.hash, locale);
              if (cached) {
                setByPath(resultMessages, item.key, cached);
              } else {
                cacheMisses.push(item);
              }
            }

            if (cacheMisses.length === 0) {
              return resultMessages;
            }

            if (!supportsStreaming || !provider.translateStream) {
              const batchItems = cacheMisses.map(({ text, hash }) => ({ text, hash }));
              const { translations } = await translator.translateBatch(batchItems, locale);
              for (const item of cacheMisses) {
                const translation = translations.get(item.hash);
                if (translation) {
                  setByPath(resultMessages, item.key, translation);
                }
              }
              return resultMessages;
            }

            const textsToTranslate = cacheMisses.map((item) => item.text);
            const streamGenerator = provider.translateStream(
              textsToTranslate,
              locale,
              translator.getExcludedTerms(),
              translator.getContext(),
              translator.getGlossary(),
              translator.getStyle(),
            );

            for await (const { index: streamIndex, translation } of streamGenerator) {
              const item = cacheMisses[streamIndex];
              if (item && translation) {
                await translator.cacheTranslation(item.hash, translation, locale);
                setByPath(resultMessages, item.key, translation);
              }
            }

            return resultMessages;
          })();

          promise.then(
            (r) => {
              result = r;
            },
            (e) => {
              error = e;
            },
          );
        }
        return promise;
      };

      // Return a thenable for React Suspense
      return {
        then(
          onFulfilled: (value: Record<string, any>) => void,
          onRejected?: (error: Error) => void,
        ) {
          if (result) {
            onFulfilled(result);
          } else if (error) {
            onRejected?.(error);
          } else {
            getPromise().then(onFulfilled, onRejected);
          }
        },
      };
    },
  };
};
