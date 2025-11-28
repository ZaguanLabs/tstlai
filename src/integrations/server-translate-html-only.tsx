import { Suspense, createElement } from 'react';
import { Tstlai } from '../core/Tstlai';

interface TranslateHTMLProps {
  /** The Tstlai translator instance */
  translator: Tstlai;
  /** HTML string to translate */
  html: string;
  /** Wrapper element tag (default: 'div') */
  as?: 'div' | 'span' | 'section' | 'article' | 'main' | 'aside' | 'header' | 'footer' | 'p';
  /** Additional props for the wrapper element */
  className?: string;
}

/**
 * Async component that translates HTML content
 */
async function TranslatedHTML({ translator, html, as = 'div', className }: TranslateHTMLProps) {
  // Skip if source language
  if (translator.isSourceLang()) {
    return createElement(as, { className, dangerouslySetInnerHTML: { __html: html } });
  }

  const { html: translatedHtml } = await translator.process(html);
  return createElement(as, {
    className,
    dangerouslySetInnerHTML: { __html: translatedHtml },
  });
}

/**
 * Server Component that translates HTML content with Suspense support.
 * Shows original HTML immediately while translation loads.
 *
 * @example
 * ```tsx
 * // app/[locale]/about/page.tsx
 * import { TranslateHTML } from 'tstlai/next';
 * import { getTranslator } from '@/lib/translator';
 *
 * const ABOUT_CONTENT = `
 *   <h1>About Us</h1>
 *   <p>We build amazing products for developers.</p>
 *   <p>Our team is passionate about quality.</p>
 * `;
 *
 * export default async function AboutPage({ params }) {
 *   const { locale } = await params;
 *
 *   return (
 *     <main>
 *       <TranslateHTML
 *         translator={getTranslator(locale)}
 *         html={ABOUT_CONTENT}
 *       />
 *     </main>
 *   );
 * }
 * ```
 */
export function TranslateHTML({ translator, html, as = 'div', className }: TranslateHTMLProps) {
  // Fallback shows original content immediately
  const fallback = createElement(as, {
    className,
    dangerouslySetInnerHTML: { __html: html },
  });

  return (
    <Suspense fallback={fallback}>
      <TranslatedHTML translator={translator} html={html} as={as} className={className} />
    </Suspense>
  );
}

// Keep ServerTranslate as an alias for backwards compatibility
// but document that it only works with HTML strings
export const ServerTranslate = TranslateHTML;

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
