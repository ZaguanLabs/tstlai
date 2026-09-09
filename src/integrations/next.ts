import * as crypto from 'crypto';
import { Tstlai } from '../core/Tstlai';
import { abortError } from '../core/TranslationPipeline';
import { preserveWhitespace, stripContextMarkers } from '../core/text';

/** Default limits for route handlers */
const DEFAULT_LIMITS = {
  maxTexts: 100,
  maxTotalChars: 100000,
};

/** Options for route handler security */
export interface RouteHandlerOptions {
  /** Maximum number of texts per request (default: 100) */
  maxTexts?: number;
  /** Maximum total characters across all texts (default: 100000) */
  maxTotalChars?: number;
  /** Disable all built-in limits (not recommended) */
  disableLimits?: boolean;
}

let securityWarningShown = false;

function showSecurityWarning(): void {
  if (securityWarningShown) return;
  if (process.env.NODE_ENV !== 'production') return;

  securityWarningShown = true;
  console.warn(
    '\n⚠️  [tstlai] Security Warning: Translation endpoint is publicly accessible.\n' +
      '   Add rate limiting and origin validation for production use.\n' +
      '   See: https://github.com/AiTsLai/tstlai/blob/main/docs/guides/security.md\n',
  );
}

function validateRequestLimits(
  texts: string[],
  options: RouteHandlerOptions,
): { valid: boolean; error?: string } {
  if (options.disableLimits) {
    return { valid: true };
  }

  const maxTexts = options.maxTexts ?? DEFAULT_LIMITS.maxTexts;
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_LIMITS.maxTotalChars;

  if (texts.length > maxTexts) {
    return { valid: false, error: `Too many texts: ${texts.length} exceeds limit of ${maxTexts}` };
  }

  const totalChars = texts.reduce((sum, t) => sum + (t?.length || 0), 0);
  if (totalChars > maxTotalChars) {
    return {
      valid: false,
      error: `Request too large: ${totalChars} chars exceeds limit of ${maxTotalChars}`,
    };
  }

  return { valid: true };
}

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
    const translated = translations.get(item.hash) ?? item.text;
    lookup.set(item.text, translated);
  });

  // Return synchronous lookup function
  return (key: string): string => {
    const trimmed = key.trim();
    return lookup.get(trimmed) ?? trimmed;
  };
};

/**
 * Creates a Route Handler for Next.js App Router.
 * Uses standard Response API (no Next.js imports required).
 *
 * @param translator - Tstlai instance
 * @param options - Optional security limits (maxTexts, maxTotalChars, disableLimits)
 *
 * @example
 * ```typescript
 * // Basic usage with default limits
 * export const POST = createNextRouteHandler(translator);
 *
 * // Custom limits
 * export const POST = createNextRouteHandler(translator, { maxTexts: 50 });
 * ```
 */
export const createNextRouteHandler = (translator: Tstlai, options: RouteHandlerOptions = {}) => {
  return async (req: Request): Promise<Response> => {
    // Show security warning once in production
    showSecurityWarning();

    try {
      const body = await req.json().catch(() => null);
      const { texts, targetLang } = body ?? {};

      if (
        !Array.isArray(texts) ||
        texts.some((text) => typeof text !== 'string') ||
        (targetLang !== undefined && (typeof targetLang !== 'string' || !targetLang.trim()))
      ) {
        return new Response(JSON.stringify({ error: 'Invalid request body' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Validate request limits
      const validation = validateRequestLimits(texts, options);
      if (!validation.valid) {
        return new Response(JSON.stringify({ error: validation.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Generate hashes for batch processing
      const items = texts.map((text: string) => {
        const hash = crypto.createHash('sha256').update(text.trim()).digest('hex');
        return { text, hash };
      });

      const { translations, status, error } = await translator.translateBatch(items, targetLang, {
        signal: req.signal,
      });

      // Return array of translated texts in order
      const results = items.map((item: any) =>
        preserveWhitespace(
          item.text,
          translations.get(item.hash) ?? stripContextMarkers(item.text),
        ),
      );

      return new Response(
        JSON.stringify({
          translations: results,
          status,
          ...(error
            ? {
                error: 'Translation failed',
                failedIndices: items.flatMap((item, index) =>
                  translations.has(item.hash) ? [] : [index],
                ),
              }
            : {}),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error) {
      console.error('[Tstlai] Route Handler Error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
};

/**
 * Creates a Streaming Route Handler for Next.js App Router.
 * Streams translations as Server-Sent Events (SSE) for progressive updates.
 *
 * @param translator - Tstlai instance
 * @param options - Optional security limits (maxTexts, maxTotalChars, disableLimits)
 *
 * @example
 * ```typescript
 * // src/app/api/tstlai/stream/route.ts
 * import { createNextStreamingRouteHandler } from 'tstlai/next';
 * import { getTranslator } from '@/lib/translator';
 *
 * export const POST = createNextStreamingRouteHandler(getTranslator());
 * ```
 */
export const createNextStreamingRouteHandler = (
  translator: Tstlai,
  options: RouteHandlerOptions = {},
) => {
  return async (req: Request): Promise<Response> => {
    // Show security warning once in production
    showSecurityWarning();

    try {
      const body = await req.json().catch(() => null);
      const { texts, targetLang } = body ?? {};

      if (
        !Array.isArray(texts) ||
        texts.some((text) => typeof text !== 'string') ||
        (targetLang !== undefined && (typeof targetLang !== 'string' || !targetLang.trim()))
      ) {
        return new Response(JSON.stringify({ error: 'Invalid request body' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Validate request limits
      const validation = validateRequestLimits(texts, options);
      if (!validation.valid) {
        return new Response(JSON.stringify({ error: validation.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Check if provider supports streaming
      const provider = translator.getProvider();
      const supportsStreaming =
        typeof provider.translateStream === 'function' && (provider.supportsStreaming?.() ?? true);

      if (!supportsStreaming || translator.isSourceLang(targetLang)) {
        // Fallback to batch mode
        const items = texts.map((text: string) => {
          const hash = crypto.createHash('sha256').update(text.trim()).digest('hex');
          return { text, hash };
        });

        const { translations, status, error } = await translator.translateBatch(items, targetLang, {
          signal: req.signal,
        });
        const results = items.map((item) =>
          preserveWhitespace(
            item.text,
            translations.get(item.hash) ?? stripContextMarkers(item.text),
          ),
        );

        return new Response(
          JSON.stringify({
            translations: results,
            status,
            ...(error
              ? {
                  error: 'Translation failed',
                  failedIndices: items.flatMap((item, index) =>
                    translations.has(item.hash) ? [] : [index],
                  ),
                }
              : {}),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      const items = texts.map((text: string) => ({
        text,
        hash: crypto.createHash('sha256').update(text.trim()).digest('hex'),
      }));
      const encoder = new TextEncoder();
      const cancellation = new AbortController();
      const iterator = translator.translateBatchStream(items, targetLang, {
        signal: cancellation.signal,
      });
      let finished = false;
      let streamController: ReadableStreamDefaultController<Uint8Array>;
      const cleanup = () => req.signal.removeEventListener('abort', abort);
      const abort = () => {
        if (finished) return;
        finished = true;
        cancellation.abort();
        cleanup();
        streamController.error(abortError());
        void iterator.return(undefined).catch(() => {});
      };
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          req.signal.addEventListener('abort', abort, { once: true });
          if (req.signal.aborted) abort();
        },
        async pull(controller) {
          if (finished) return;
          try {
            const result = await iterator.next();
            if (finished) return;
            if (result.done) {
              finished = true;
              cleanup();
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } else {
              const { index, translation } = result.value;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    index,
                    translation: preserveWhitespace(items[index].text, translation),
                  })}\n\n`,
                ),
              );
            }
          } catch {
            if (finished) return;
            finished = true;
            cleanup();
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: 'Translation failed' })}\n\n`),
            );
            controller.close();
          }
        },
        async cancel() {
          finished = true;
          cancellation.abort();
          cleanup();
          await iterator.return(undefined);
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
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
