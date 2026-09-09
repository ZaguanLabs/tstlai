export { createExpressMiddleware } from './express';
export { createFastifyPlugin } from './fastify';
export { createRemixHandler } from './remix';
export { createAstroMiddleware } from './astro';
export { createNextIntlAdapter, createStreamingNextIntlAdapter } from './next-intl';
export {
  createNextRouteHandler,
  createNextStreamingRouteHandler,
  createPageTranslations,
} from './next-server';
export type { RouteHandlerOptions } from './next-server';
