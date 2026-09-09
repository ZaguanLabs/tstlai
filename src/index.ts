export * from './core';

import * as serverIntegrations from './integrations/server';

/** Legacy namespace: loading the server API does not load optional React dependencies. */
export const integrations: typeof serverIntegrations & {
  readonly AutoTranslate: typeof import('./integrations/react-auto-translate').AutoTranslate;
} = {
  ...serverIntegrations,
  get AutoTranslate(): typeof import('./integrations/react-auto-translate').AutoTranslate {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- preserve the synchronous legacy API while loading React only on access
    return require('./integrations/react-auto-translate').AutoTranslate;
  },
};
