import React, { Suspense } from 'react';
import { Tstlai } from '../core/Tstlai';

interface ServerTranslateProps {
  /** The Tstlai translator instance */
  translator: Tstlai;
  /** Content to translate - can be a React element or HTML string */
  children: React.ReactNode;
  /** Fallback content to show while translating (defaults to children) */
  fallback?: React.ReactNode;
  /** HTML string to translate (alternative to children) */
  html?: string;
}

/**
 * Async component that performs the actual translation
 */
async function TranslatedContent({
  translator,
  children,
  html,
}: {
  translator: Tstlai;
  children?: React.ReactNode;
  html?: string;
}) {
  // If HTML string provided, translate it directly
  if (html) {
    const { html: translatedHtml } = await translator.process(html);
    return <div dangerouslySetInnerHTML={{ __html: translatedHtml }} />;
  }

  // For React children, we need to render to string first
  // This requires react-dom/server which is available in Next.js server components
  const { renderToStaticMarkup } = await import('react-dom/server');
  const htmlString = renderToStaticMarkup(<>{children}</>);

  // Skip translation if content is empty
  if (!htmlString.trim()) {
    return <>{children}</>;
  }

  const { html: translatedHtml } = await translator.process(htmlString);
  return <div dangerouslySetInnerHTML={{ __html: translatedHtml }} />;
}

/**
 * Server-side translation component with Suspense support.
 * Wraps any React content and translates all text nodes automatically.
 *
 * @example
 * ```tsx
 * // app/[locale]/page.tsx - ZERO refactoring needed!
 * import { ServerTranslate } from 'tstlai/next';
 * import { getTranslator } from '@/lib/translator';
 *
 * export default async function AboutPage({ params }) {
 *   const { locale } = await params;
 *   const translator = getTranslator(locale);
 *
 *   return (
 *     <ServerTranslate translator={translator}>
 *       <h1>About Us</h1>
 *       <p>We build amazing products.</p>
 *       <p>Our team is passionate about quality.</p>
 *     </ServerTranslate>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With Suspense fallback showing original content
 * <ServerTranslate
 *   translator={translator}
 *   fallback={<OriginalContent />}
 * >
 *   <OriginalContent />
 * </ServerTranslate>
 * ```
 */
export function ServerTranslate({ translator, children, fallback, html }: ServerTranslateProps) {
  // Use children as fallback if not provided
  const suspenseFallback = fallback ?? children;

  return (
    <Suspense fallback={suspenseFallback}>
      <TranslatedContent translator={translator} html={html}>
        {children}
      </TranslatedContent>
    </Suspense>
  );
}

/**
 * Translate an HTML string directly on the server.
 * Returns the translated HTML string.
 *
 * @example
 * ```tsx
 * import { translateHTML } from 'tstlai/next';
 *
 * const html = '<h1>Hello World</h1><p>Welcome to our site.</p>';
 * const translated = await translateHTML(translator, html);
 * ```
 */
export async function translateHTML(translator: Tstlai, html: string): Promise<string> {
  const { html: translatedHtml } = await translator.process(html);
  return translatedHtml;
}

/**
 * Higher-order component that wraps a page component with translation.
 * The entire page output is translated automatically.
 *
 * @example
 * ```tsx
 * // app/[locale]/about/page.tsx
 * import { withTranslation } from 'tstlai/next';
 * import { getTranslator } from '@/lib/translator';
 *
 * function AboutPage() {
 *   return (
 *     <main>
 *       <h1>About Us</h1>
 *       <p>We build amazing products.</p>
 *     </main>
 *   );
 * }
 *
 * export default withTranslation(AboutPage, getTranslator);
 * ```
 */
export function withTranslation<P extends { params: Promise<{ locale: string }> }>(
  Component: React.ComponentType<Omit<P, 'params'> & { locale: string }>,
  getTranslator: (locale: string) => Tstlai,
) {
  return async function TranslatedPage(props: P) {
    const { locale } = await props.params;
    const translator = getTranslator(locale);

    // Check if source language - skip translation
    if (translator.isSourceLang()) {
      return <Component {...(props as any)} locale={locale} />;
    }

    return (
      <ServerTranslate translator={translator}>
        <Component {...(props as any)} locale={locale} />
      </ServerTranslate>
    );
  };
}
