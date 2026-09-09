import * as crypto from 'crypto';
import { Tstlai } from '../core/Tstlai';
import { TranslationRequestOptions } from '../types';

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
  }, Object.create(null));
};

// Helper to set value by dot path
const setByPath = (obj: any, path: string, value: any) => {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!Object.prototype.hasOwnProperty.call(current, parts[i])) {
      Object.defineProperty(current, parts[i], {
        value: {},
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    current = current[parts[i]];
  }
  Object.defineProperty(current, parts[parts.length - 1], {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
};

export const createNextIntlAdapter = (translator: Tstlai, sourceMessages: Record<string, any>) => {
  return {
    /**
     * Async replacement for next-intl's getTranslations.
     * Translates the entire sourceMessages object to the target locale JIT.
     */
    getTranslations: async (locale: string, options: TranslationRequestOptions = {}) => {
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
      const { translations } = await translator.translateBatch(batchItems, locale, options);

      const resultMessages = JSON.parse(JSON.stringify(sourceMessages));
      entries.forEach(([key, text], index) => {
        const hash = batchItems[index].hash;
        const translatedText = translations.get(hash) ?? text;
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
    getMessages: async (locale: string, options: TranslationRequestOptions = {}) => {
      const flat = flatten(sourceMessages);
      const entries = Object.entries(flat);

      const batchItems = entries.map(([_, text]) => ({
        text: text as string,
        hash: crypto
          .createHash('sha256')
          .update((text as string).trim())
          .digest('hex'),
      }));

      const { translations } = await translator.translateBatch(batchItems, locale, options);

      const resultMessages = JSON.parse(JSON.stringify(sourceMessages));
      entries.forEach(([key, text], index) => {
        const hash = batchItems[index].hash;
        const translatedText = translations.get(hash) ?? text;
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

  const getStreamingMessages = async (
    locale: string,
    options: TranslationRequestOptions = {},
  ): Promise<Record<string, any>> => {
    const result = JSON.parse(JSON.stringify(sourceMessages));
    // Preserve batch fallback semantics for providers without streaming support.
    const provider = translator.getProvider();
    if (!provider.translateStream || !(provider.supportsStreaming?.() ?? true)) {
      const { translations } = await translator.translateBatch(flatMessages, locale, options);
      for (const item of flatMessages)
        setByPath(result, item.key, translations.get(item.hash) ?? item.text);
    } else {
      for await (const { index, translation } of translator.translateBatchStream(
        flatMessages,
        locale,
        options,
      )) {
        setByPath(result, flatMessages[index].key, translation);
      }
    }
    return result;
  };

  return {
    /** Each snapshot owns its nested objects; later updates cannot mutate earlier yields. */
    async *getMessagesStream(
      locale: string,
      options: TranslationRequestOptions = {},
    ): AsyncGenerator<Record<string, any>> {
      const provider = translator.getProvider();
      if (
        translator.isSourceLang(locale) ||
        !provider.translateStream ||
        !(provider.supportsStreaming?.() ?? true)
      ) {
        yield await getStreamingMessages(locale, options);
        return;
      }
      const result = JSON.parse(JSON.stringify(sourceMessages));
      for await (const { index, translation } of translator.translateBatchStream(
        flatMessages,
        locale,
        options,
      )) {
        setByPath(result, flatMessages[index].key, translation);
        yield JSON.parse(JSON.stringify(result));
      }
    },

    getStreamingMessages,

    /** Lazy thenable, retaining the existing React Suspense interface. */
    createStreamingPromise: (locale: string, options: TranslationRequestOptions = {}) => {
      let promise: Promise<Record<string, any>> | undefined;
      return {
        then(
          onFulfilled: (value: Record<string, any>) => void,
          onRejected?: (error: Error) => void,
        ) {
          promise ??= getStreamingMessages(locale, options);
          return promise.then(onFulfilled, onRejected);
        },
      };
    },
  };
};
