import { Tstlai } from '../core/Tstlai';
import { translatedHeaders } from './response-headers';

export const createRemixHandler = (
  translator: Tstlai,
  originalHandleRequest: (...args: any[]) => any,
) => {
  return async (...args: any[]) => {
    // Call original handler
    // Remix entry.server handleRequest signature varies slightly but returns a Promise<Response>
    const response = await originalHandleRequest(...args);

    if (!(response instanceof Response)) {
      return response;
    }

    const contentType = response.headers.get('Content-Type');
    if (
      contentType &&
      contentType.includes('text/html') &&
      !response.headers.has('content-encoding') &&
      response.body
    ) {
      try {
        // Clone response to read body
        const clone = response.clone();
        const body = await clone.text();

        const result = await translator.process(body, { signal: args[0]?.signal });

        return new Response(result.html, {
          status: response.status,
          statusText: response.statusText,
          headers: translatedHeaders(response.headers),
        });
      } catch (err) {
        if (!args[0]?.signal?.aborted) console.error('[Tstlai] Remix Handler Error:', err);
        return response;
      }
    }

    return response;
  };
};
