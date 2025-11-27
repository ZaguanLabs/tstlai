import { Tstlai } from '../core/Tstlai';

export const createFastifyPlugin = (translator: Tstlai) => {
  return async (fastify: any) => {
    fastify.addHook('onSend', async (request: any, reply: any, payload: any) => {
      const contentType = reply.getHeader('content-type');

      // Only translate if HTML and payload is string
      if (
        contentType &&
        (contentType as string).includes('text/html') &&
        typeof payload === 'string'
      ) {
        try {
          const result = await translator.process(payload);
          return result.html;
        } catch (err) {
          console.error('[Tstlai] Fastify Plugin Error:', err);
          return payload;
        }
      }
      return payload;
    });
  };
};
