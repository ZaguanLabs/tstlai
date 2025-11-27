import { Tstlai } from '../core/Tstlai';

export const createRemixHandler = (translator: Tstlai, originalHandleRequest: Function) => {
  return async (...args: any[]) => {
    // Call original handler
    // Remix entry.server handleRequest signature varies slightly but returns a Promise<Response>
    const response = await originalHandleRequest(...args);

    if (!(response instanceof Response)) {
      return response;
    }

    const contentType = response.headers.get('Content-Type');
    if (contentType && contentType.includes('text/html')) {
      try {
        // Clone response to read body
        const clone = response.clone();
        const body = await clone.text();
        
        const result = await translator.process(body);
        
        return new Response(result.html, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (err) {
        console.error('[Tstlai] Remix Handler Error:', err);
        return response;
      }
    }

    return response;
  };
};
