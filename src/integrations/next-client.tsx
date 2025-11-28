'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  Suspense,
  type ReactNode,
} from 'react';

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
 * Internal component that resolves the translated messages promise.
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
  const [messages, setMessages] = useState<Record<string, any> | null>(null);
  const [status, setLocalStatus] = useState<TranslationStatus>({
    isTranslating: true,
    progress: 0,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      try {
        setStatus({ isTranslating: true, progress: 0 });
        const resolved =
          translatedMessages instanceof Promise ? await translatedMessages : translatedMessages;

        if (!cancelled) {
          setMessages(resolved);
          setLocalStatus({ isTranslating: false, progress: 100, error: null });
          setStatus({ isTranslating: false, progress: 100 });
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error(String(err));
          setLocalStatus({ isTranslating: false, progress: 0, error });
          setStatus({ isTranslating: false, progress: 0, error });
        }
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [translatedMessages, setStatus]);

  if (!messages) {
    return null; // Suspense fallback will show
  }

  return (
    <TstlaiContext.Provider value={{ locale, messages, status: status, setStatus }}>
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
