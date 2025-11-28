import * as crypto from 'crypto';
import { Tstlai } from '../core/Tstlai';

// Re-export AutoTranslate for client-side translation
export { AutoTranslate } from './react-auto-translate';

/**
 * Pre-translate all page strings in a single batch call.
 * Returns a synchronous `t()` function for instant rendering.
 *
 * @example
 * ```tsx
 * // src/app/[locale]/page.tsx
 * import { getTranslator } from '@/lib/translator';
 * import { createPageTranslations } from 'tstlai/next';
 *
 * export default async function Page({ params }) {
 *   const { locale } = await params;
 *   const t = await createPageTranslations(getTranslator(locale), [
 *     'Welcome to our site',
 *     'This is paragraph one.',
 *     'This is paragraph two.',
 *   ]);
 *
 *   return (
 *     <div>
 *       <h1>{t('Welcome to our site')}</h1>
 *       <p>{t('This is paragraph one.')}</p>
 *       <p>{t('This is paragraph two.')}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export const createPageTranslations = async (
  translator: Tstlai,
  strings: string[],
): Promise<(key: string) => string> => {
  // Bypass translation when target language matches source language
  if (translator.isSourceLang()) {
    return (key: string): string => key.trim();
  }

  // Generate hashes and batch translate
  const items = strings.map((text) => ({
    text: text.trim(),
    hash: crypto.createHash('sha256').update(text.trim()).digest('hex'),
  }));

  const { translations } = await translator.translateBatch(items);

  // Build lookup map: source text -> translated text
  const lookup = new Map<string, string>();
  items.forEach((item) => {
    const translated = translations.get(item.hash) || item.text;
    lookup.set(item.text, translated);
  });

  // Return synchronous lookup function
  return (key: string): string => {
    const trimmed = key.trim();
    return lookup.get(trimmed) || trimmed;
  };
};

/**
 * Creates a Route Handler for Next.js App Router.
 * Uses standard Response API (no Next.js imports required).
 */
export const createNextRouteHandler = (translator: Tstlai) => {
  return async (req: Request): Promise<Response> => {
    try {
      const body = await req.json();
      const { texts, targetLang } = body;

      if (!texts || !Array.isArray(texts)) {
        return new Response(JSON.stringify({ error: 'Invalid request body' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Generate hashes for batch processing
      const items = texts.map((text: string) => {
        const hash = crypto.createHash('sha256').update(text.trim()).digest('hex');
        return { text, hash };
      });

      const { translations } = await translator.translateBatch(items, targetLang);

      // Return array of translated texts in order
      const results = items.map((item: any) => translations.get(item.hash) || item.text);

      return new Response(JSON.stringify({ translations: results }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[Tstlai] Route Handler Error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
};
