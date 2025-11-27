# Framework Integrations

tstlai provides adapters for major Node.js frameworks.

## Express / Node.js

The generic middleware intercepts `res.write` and `res.end` to translate HTML responses on the fly.

```typescript
import express from 'express';
import { Tstlai, integrations } from 'tstlai';

const app = express();
const translator = new Tstlai({ targetLang: 'es', provider: { type: 'openai' } });

// Apply middleware globally
app.use(integrations.createExpressMiddleware(translator));

app.get('/', (req, res) => {
  res.send('<h1>Hello World</h1>'); // -> <h1>Hola Mundo</h1>
});
```

## Fastify

Register as a standard Fastify plugin.

```typescript
import Fastify from 'fastify';
import { Tstlai, integrations } from 'tstlai';

const fastify = Fastify();
const translator = new Tstlai({ targetLang: 'fr', provider: { type: 'openai' } });

fastify.register(integrations.createFastifyPlugin(translator));
```

## Astro

Use as middleware in `src/middleware.ts`.

```typescript
import { Tstlai, integrations } from 'tstlai';

const translator = new Tstlai({ targetLang: 'es', provider: { type: 'openai' } });

export const onRequest = integrations.createAstroMiddleware(translator);
```

## Remix

Wrap your `handleRequest` in `entry.server.tsx`.

```typescript
import { Tstlai, integrations } from 'tstlai';

const translator = new Tstlai({ targetLang: 'de', provider: { type: 'openai' } });

export default integrations.createRemixHandler(translator, function handleRequest(...) {
  // Your original Remix logic
});
```
