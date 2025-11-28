import React, { Suspense, cache } from 'react';
import { Tstlai } from '../core/Tstlai';

// Dynamic require to avoid RSC bundler blocking the import
// Using string concatenation to prevent static analysis from detecting the module
const getRenderer = () => {
  const moduleName = 'react-dom' + '/server';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(moduleName) as typeof import('react-dom/server');
  return mod.renderToString;
};

/**
 * React cache wrapper for translation to dedupe requests
 */
const translateContent = cache(async (translator: Tstlai, html: string) => {
  if (translator.isSourceLang()) {
    return html;
  }
  const { html: translatedHtml } = await translator.process(html);
  return translatedHtml;
});

interface ServerTranslateProps {
  /** The Tstlai translator instance */
  translator: Tstlai;
  /** React children to translate */
  children: React.ReactNode;
  /** Wrapper element tag (default: 'div', use 'fragment' for no wrapper) */
  as?:
    | 'div'
    | 'span'
    | 'section'
    | 'article'
    | 'main'
    | 'aside'
    | 'header'
    | 'footer'
    | 'p'
    | 'fragment';
  /** Additional className for wrapper */
  className?: string;
}

/**
 * Async Server Component that translates React children.
 *
 * NOTE: This component uses react-dom/server which is only available
 * in Server Components. It will NOT work in Client Components.
 */
async function TranslatedContent({
  translator,
  children,
  as = 'div',
  className,
}: ServerTranslateProps) {
  // Render children to HTML string using dynamic require
  const renderToString = getRenderer();
  const childrenHtml = renderToString(<>{children}</>);

  // Translate the HTML
  const translatedHtml = await translateContent(translator, childrenHtml);

  // Return with or without wrapper
  if (as === 'fragment') {
    return <div dangerouslySetInnerHTML={{ __html: translatedHtml }} />;
  }

  return React.createElement(as, {
    className,
    dangerouslySetInnerHTML: { __html: translatedHtml },
  });
}

/**
 * Zero-refactor translation component for Next.js Server Components.
 * Wrap any JSX content and it will be translated automatically.
 *
 * @example
 * ```tsx
 * // app/[locale]/about/page.tsx
 * import { ServerTranslate } from 'tstlai/next';
 * import { getTranslator } from '@/lib/translator';
 *
 * export default async function AboutPage({ params }) {
 *   const { locale } = await params;
 *
 *   return (
 *     <ServerTranslate translator={getTranslator(locale)}>
 *       <h1>About Us</h1>
 *       <p>We build amazing products.</p>
 *       <p>Our team is passionate about quality.</p>
 *     </ServerTranslate>
 *   );
 * }
 * ```
 */
export async function ServerTranslate({
  translator,
  children,
  as = 'div',
  className,
}: ServerTranslateProps) {
  // If source language, render children directly (no translation needed)
  if (translator.isSourceLang()) {
    if (as === 'fragment') {
      return <>{children}</>;
    }
    return React.createElement(as, { className }, children);
  }

  // Fallback shows original content
  const fallback =
    as === 'fragment' ? <>{children}</> : React.createElement(as, { className }, children);

  return (
    <Suspense fallback={fallback}>
      <TranslatedContent translator={translator} as={as} className={className}>
        {children}
      </TranslatedContent>
    </Suspense>
  );
}
