import * as crypto from 'crypto';
import { Tstlai } from '../core/Tstlai';

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
