import * as crypto from 'crypto';
import { Tstlai } from '../core/Tstlai';

export const createNextIntegration = (translator: Tstlai) => {
  return {
    /**
     * React Server Component for translation.
     * Usage: <Translate>Hello World</Translate>
     */
    Translate: async (props: { children: string | any }) => {
      const text = props.children;
      // Only translate raw strings
      if (typeof text !== 'string') return text;

      try {
        return await translator.translateText(text);
      } catch (err) {
        console.error('[Tstlai] Next.js Translation Error:', err);
        return text;
      }
    },
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
