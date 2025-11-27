'use client';

import React, { createContext, useContext, ReactNode } from 'react';

interface TstlaiContextType {
  locale: string;
  messages: Record<string, any>;
}

const TstlaiContext = createContext<TstlaiContextType | null>(null);

export interface TstlaiProviderProps {
  children: ReactNode;
  locale: string;
  initialMessages: Record<string, any>;
}

/**
 * Client-side provider to hydrate translations.
 * Place this in your root layout or page wrapper.
 */
export const TstlaiProvider = ({ children, locale, initialMessages }: TstlaiProviderProps) => {
  return (
    <TstlaiContext.Provider value={{ locale, messages: initialMessages }}>
      {children}
    </TstlaiContext.Provider>
  );
};

/**
 * Hook to use translations in Client Components.
 * Requires TstlaiProvider up the tree.
 */
export const useTranslations = () => {
  const context = useContext(TstlaiContext);
  if (!context) {
    throw new Error('useTranslations must be used within a TstlaiProvider');
  }

  const { messages } = context;

  const t = (key: string) => {
    // Support dot notation if messages are nested
    // If messages are flat (key: "nav.home"), straightforward lookup
    if (messages[key]) return messages[key];

    const parts = key.split('.');
    let current: any = messages;
    for (const part of parts) {
      if (current === undefined || current === null) break;
      current = current[part];
    }

    return current !== undefined ? current : key;
  };

  return t;
};
