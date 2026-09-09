import { Tstlai } from '../core/Tstlai';
import { translatedHeaders } from './response-headers';

export const createAstroMiddleware = (translator: Tstlai) => {
  return async (context: any, next: () => Promise<Response>) => {
    const response = await next();

    const contentType = response.headers.get('Content-Type');
    if (
      contentType &&
      contentType.includes('text/html') &&
      !response.headers.has('content-encoding') &&
      response.body
    ) {
      try {
        const html = await response.clone().text();
        const result = await translator.process(html, { signal: context.request?.signal });

        return new Response(result.html, {
          status: response.status,
          statusText: response.statusText,
          headers: translatedHeaders(response.headers),
        });
      } catch (err) {
        if (!context.request?.signal?.aborted)
          console.error('[Tstlai] Astro Middleware Error:', err);
        return response;
      }
    }

    return response;
  };
};
