import { responseCancellation } from './response-cancellation';
import { Tstlai } from '../core/Tstlai';
import { TRANSFORMED_HEADERS } from './response-headers';

export const createFastifyPlugin = (translator: Tstlai) => {
  return async (fastify: any) => {
    fastify.addHook('onSend', async (request: any, reply: any, payload: any) => {
      const contentType = reply.getHeader('content-type');

      // Only translate if HTML and payload is string
      if (
        contentType &&
        (contentType as string).includes('text/html') &&
        typeof payload === 'string' &&
        !reply.getHeader('content-encoding')
      ) {
        const cancellation = responseCancellation(reply.raw);
        try {
          const result = await translator.process(payload, { signal: cancellation.signal });
          for (const name of TRANSFORMED_HEADERS) reply.removeHeader(name);
          return result.html;
        } catch (err) {
          if (!cancellation.signal.aborted) console.error('[Tstlai] Fastify Plugin Error:', err);
          return payload;
        } finally {
          cancellation.dispose();
        }
      }
      return payload;
    });
  };
};
