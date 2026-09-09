'use client';

export { AutoTranslate } from './react-auto-translate';
export type { AutoTranslateProps } from './react-auto-translate';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  Suspense,
  type ReactNode,
} from 'react';
import { requestTranslations, type ClientRequestLimits } from './client-transport';
import { normalizeLocaleCode } from '../languages';
import { stripContextMarkers } from '../core/text';

interface TranslationStatus {
  isTranslating: boolean;
  progress: number; // 0-100
  error: Error | null;
}

interface TstlaiContextType {
  locale: string;
  messages: Record<string, any>;
  status: TranslationStatus;
  setStatus: (status: Partial<TranslationStatus>) => void;
}

const TstlaiContext = createContext<TstlaiContextType | null>(null);

export interface TstlaiProviderProps {
  children: ReactNode;
  locale: string;
  initialMessages: Record<string, any>;
}

export interface TstlaiSuspenseProviderProps {
  children: ReactNode;
  locale: string;
  fallbackLocale?: string;
  fallbackMessages: Record<string, any>;
  translatedMessages: Promise<Record<string, any>> | Record<string, any>;
}

/**
 * Client-side provider to hydrate translations.
 * Place this in your root layout or page wrapper.
 */
export const TstlaiProvider = ({ children, locale, initialMessages }: TstlaiProviderProps) => {
  const [status, setStatusState] = useState<TranslationStatus>({
    isTranslating: false,
    progress: 100,
    error: null,
  });

  const setStatus = useCallback((partial: Partial<TranslationStatus>) => {
    setStatusState((prev) => ({ ...prev, ...partial }));
  }, []);

  return (
    <TstlaiContext.Provider value={{ locale, messages: initialMessages, status, setStatus }}>
      {children}
    </TstlaiContext.Provider>
  );
};

/**
 * Cache for promise status tracking (React Suspense pattern)
 */
const promiseCache = new WeakMap<
  Promise<Record<string, any>>,
  { status: 'pending' | 'fulfilled' | 'rejected'; result?: Record<string, any>; error?: Error }
>();

/**
 * Use a promise with React Suspense (throws if pending)
 */
function usePromise<T>(promise: Promise<T> | T): T {
  // If not a promise, return directly
  if (!(promise instanceof Promise)) {
    return promise;
  }

  // Check cache
  let cached = promiseCache.get(promise as Promise<Record<string, any>>);

  if (!cached) {
    // First time seeing this promise - start tracking
    cached = { status: 'pending' };
    promiseCache.set(promise as Promise<Record<string, any>>, cached);

    promise.then(
      (result) => {
        cached!.status = 'fulfilled';
        cached!.result = result as Record<string, any>;
      },
      (error) => {
        cached!.status = 'rejected';
        cached!.error = error instanceof Error ? error : new Error(String(error));
      },
    );
  }

  // Handle based on status
  if (cached.status === 'pending') {
    throw promise; // Triggers Suspense
  }

  if (cached.status === 'rejected') {
    throw cached.error;
  }

  return cached.result as T;
}

/**
 * Internal component that resolves the translated messages promise.
 * Uses React Suspense pattern - throws promise to trigger Suspense boundary.
 */
function TranslatedContent({
  children,
  locale,
  translatedMessages,
  setStatus,
}: {
  children: ReactNode;
  locale: string;
  translatedMessages: Promise<Record<string, any>> | Record<string, any>;
  setStatus: (status: Partial<TranslationStatus>) => void;
}) {
  // This will throw if promise is pending (triggering Suspense)
  const messages = usePromise(translatedMessages);

  // Update status when we have messages
  useEffect(() => {
    setStatus({ isTranslating: false, progress: 100 });
  }, [setStatus]);

  const status: TranslationStatus = {
    isTranslating: false,
    progress: 100,
    error: null,
  };

  return (
    <TstlaiContext.Provider value={{ locale, messages, status, setStatus }}>
      {children}
    </TstlaiContext.Provider>
  );
}

/**
 * Suspense-enabled provider that shows fallback content immediately
 * and swaps in translations when ready.
 *
 * @example
 * ```tsx
 * // layout.tsx
 * import { TstlaiSuspenseProvider } from 'tstlai/client';
 * import enMessages from '@/messages/en.json';
 *
 * export default async function Layout({ children, params }) {
 *   const { locale } = await params;
 *   const translatedMessages = translateMessages(enMessages, locale);
 *
 *   return (
 *     <TstlaiSuspenseProvider
 *       locale={locale}
 *       fallbackLocale="en"
 *       fallbackMessages={enMessages}
 *       translatedMessages={translatedMessages}
 *     >
 *       {children}
 *     </TstlaiSuspenseProvider>
 *   );
 * }
 * ```
 */
export const TstlaiSuspenseProvider = ({
  children,
  locale,
  fallbackLocale = 'en',
  fallbackMessages,
  translatedMessages,
}: TstlaiSuspenseProviderProps) => {
  const [status, setStatusState] = useState<TranslationStatus>({
    isTranslating: locale !== fallbackLocale,
    progress: locale === fallbackLocale ? 100 : 0,
    error: null,
  });

  const setStatus = useCallback((partial: Partial<TranslationStatus>) => {
    setStatusState((prev) => ({ ...prev, ...partial }));
  }, []);

  // If locale matches fallback, render immediately without Suspense
  if (locale === fallbackLocale) {
    return (
      <TstlaiContext.Provider value={{ locale, messages: fallbackMessages, status, setStatus }}>
        {children}
      </TstlaiContext.Provider>
    );
  }

  // Fallback provider shows English content immediately
  const fallback = (
    <TstlaiContext.Provider value={{ locale, messages: fallbackMessages, status, setStatus }}>
      {children}
    </TstlaiContext.Provider>
  );

  return (
    <Suspense fallback={fallback}>
      <TranslatedContent
        locale={locale}
        translatedMessages={translatedMessages}
        setStatus={setStatus}
      >
        {children}
      </TranslatedContent>
    </Suspense>
  );
};

/**
 * Hook to use translations in Client Components.
 * Requires TstlaiProvider up the tree.
 *
 * @param namespace - Optional namespace prefix for keys (e.g., 'header')
 */
export const useTranslations = (namespace?: string) => {
  const context = useContext(TstlaiContext);
  if (!context) {
    throw new Error('useTranslations must be used within a TstlaiProvider');
  }

  const { messages } = context;

  // If namespace provided, get that section of messages
  const scopedMessages = namespace ? getNestedValue(messages, namespace) || {} : messages;

  const t = (key: string) => {
    // Support dot notation if messages are nested
    if (scopedMessages[key]) return scopedMessages[key];

    const parts = key.split('.');
    let current: any = scopedMessages;
    for (const part of parts) {
      if (current === undefined || current === null) break;
      current = current[part];
    }

    return current !== undefined ? current : key;
  };

  return t;
};

/**
 * Hook to get the current translation status.
 * Useful for showing loading indicators.
 *
 * @example
 * ```tsx
 * function TranslationIndicator() {
 *   const { isTranslating, progress } = useTranslationStatus();
 *
 *   if (!isTranslating) return null;
 *
 *   return (
 *     <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-3 py-1 rounded">
 *       Translating... {progress}%
 *     </div>
 *   );
 * }
 * ```
 */
export const useTranslationStatus = (): TranslationStatus => {
  const context = useContext(TstlaiContext);
  if (!context) {
    throw new Error('useTranslationStatus must be used within a TstlaiProvider');
  }
  return context.status;
};

/**
 * Hook to get the current locale.
 */
export const useLocale = (): string => {
  const context = useContext(TstlaiContext);
  if (!context) {
    throw new Error('useLocale must be used within a TstlaiProvider');
  }
  return context.locale;
};

// Helper to get nested value from object
function getNestedValue(obj: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

// Helper to set value by dot path
function setNestedValue(obj: Record<string, any>, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const child = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined;
    const copy = Array.isArray(child)
      ? [...child]
      : child && typeof child === 'object'
        ? { ...child }
        : {};
    Object.defineProperty(current, key, {
      value: copy,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    current = current[key];
  }
  const key = parts[parts.length - 1];
  Object.defineProperty(current, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

// Helper to flatten object to dot notation
function flattenMessages(obj: any, prefix = ''): Array<{ key: string; text: string }> {
  const result: Array<{ key: string; text: string }> = [];
  for (const k of Object.keys(obj)) {
    const pre = prefix.length ? prefix + '.' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      result.push(...flattenMessages(obj[k], pre + k));
    } else if (typeof obj[k] === 'string') {
      result.push({ key: pre + k, text: obj[k] });
    }
  }
  return result;
}

export interface TstlaiStreamingProviderProps extends ClientRequestLimits {
  children: ReactNode;
  locale: string;
  sourceLocale?: string;
  sourceMessages: Record<string, any>;
  /** Streaming API endpoint (default: /api/tstlai/stream) */
  streamEndpoint?: string;
  /** Buffer time in ms before first update (default: 500) */
  streamBuffer?: number;
}

/**
 * Streaming provider that renders English immediately and progressively
 * updates with translations as they stream in.
 *
 * @example
 * ```tsx
 * // layout.tsx
 * import { TstlaiStreamingProvider } from 'tstlai/client';
 * import enMessages from '@/messages/en.json';
 *
 * export default async function Layout({ children, params }) {
 *   const { locale } = await params;
 *
 *   return (
 *     <TstlaiStreamingProvider
 *       locale={locale}
 *       sourceLocale="en"
 *       sourceMessages={enMessages}
 *       streamEndpoint="/api/tstlai/stream"
 *     >
 *       {children}
 *     </TstlaiStreamingProvider>
 *   );
 * }
 * ```
 */
export const TstlaiStreamingProvider = ({
  children,
  locale,
  sourceLocale = 'en',
  sourceMessages,
  streamEndpoint = '/api/tstlai/stream',
  streamBuffer = 500,
  maxTexts = 100,
  maxTotalChars = 100000,
}: TstlaiStreamingProviderProps) => {
  const [messages, setMessages] = useState<Record<string, any>>(sourceMessages);
  const [status, setStatusState] = useState<TranslationStatus>({
    isTranslating: normalizeLocaleCode(locale) !== normalizeLocaleCode(sourceLocale),
    progress: normalizeLocaleCode(locale) === normalizeLocaleCode(sourceLocale) ? 100 : 0,
    error: null,
  });
  const setStatus = useCallback((partial: Partial<TranslationStatus>) => {
    setStatusState((prev) => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const flatMessages = flattenMessages(sourceMessages);
    const total = flatMessages.length;
    const isSource = normalizeLocaleCode(locale) === normalizeLocaleCode(sourceLocale);
    setMessages(sourceMessages);
    setStatus({
      isTranslating: !isSource && total > 0,
      progress: isSource || total === 0 ? 100 : 0,
      error: null,
    });
    if (isSource || !total) return () => abort.abort();

    let firstUpdate = false;
    let completed = 0;
    const pending = new Map<number, string>();
    const apply = () => {
      if (abort.signal.aborted) return;
      // React may evaluate the updater later. Capture an immutable batch before clearing it.
      const updates = [...pending];
      pending.clear();
      if (updates.length) {
        setMessages((previous) => {
          const next = { ...previous };
          for (const [index, text] of updates) setNestedValue(next, flatMessages[index].key, text);
          return next;
        });
      }
      firstUpdate = true;
    };
    const timer = setTimeout(apply, streamBuffer);
    void (async () => {
      try {
        await requestTranslations({
          endpoint: streamEndpoint,
          texts: flatMessages.map((item) => item.text),
          targetLang: locale,
          signal: abort.signal,
          maxTexts,
          maxTotalChars,
          onTranslation(index, translation) {
            pending.set(index, stripContextMarkers(translation));
            completed++;
            if (firstUpdate) apply();
            // Completion is confirmed only when the transport receives a valid terminal event.
            setStatus({
              isTranslating: true,
              progress: Math.min(99, Math.round((completed / total) * 100)),
            });
          },
        });
        apply();
        setStatus({ isTranslating: false, progress: 100, error: null });
      } catch (error) {
        if (!abort.signal.aborted) {
          apply();
          setStatus({
            isTranslating: false,
            progress: Math.min(99, Math.round((completed / total) * 100)),
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [
    locale,
    sourceLocale,
    sourceMessages,
    streamEndpoint,
    streamBuffer,
    maxTexts,
    maxTotalChars,
    setStatus,
  ]);

  return (
    <TstlaiContext.Provider value={{ locale, messages, status, setStatus }}>
      {children}
    </TstlaiContext.Provider>
  );
};
