import { Tstlai } from '../core/Tstlai';

export const createAstroMiddleware = (translator: Tstlai) => {
  return async (context: any, next: () => Promise<Response>) => {
    const response = await next();

    const contentType = response.headers.get('Content-Type');
    if (contentType && contentType.includes('text/html')) {
      try {
        const html = await response.text();
        const result = await translator.process(html);

        return new Response(result.html, {
          status: response.status,
          headers: response.headers,
        });
      } catch (err) {
        console.error('[Tstlai] Astro Middleware Error:', err);
        return response;
      }
    }

    return response;
  };
};
