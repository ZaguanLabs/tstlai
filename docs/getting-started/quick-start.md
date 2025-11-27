# Quick Start

This guide shows how to initialize the tstlai engine and translate a raw HTML snippet.

## Basic Usage

```typescript
import { Tstlai } from 'tstlai';

async function main() {
  // 1. Initialize the Engine
  const translator = new Tstlai({
    targetLang: 'es', // Spanish
    provider: {
      type: 'openai',
      // apiKey, model, and baseUrl can be omitted if set via env vars
      apiKey: process.env.OPENAI_API_KEY, 
    },
    cache: {
      type: 'memory', // Good for development
      ttl: 3600 // 1 hour
    }
  });

  // 2. Define content
  const rawHtml = `
    <article>
      <h1>Welcome to the Future</h1>
      <p>Translate your website instantly.</p>
      <button data-no-translate>tstlai v1.0</button>
    </article>
  `;

  // 3. Process translation
  const result = await translator.process(rawHtml);

  console.log(result.html);
}

main();
```

## Output

```html
<article>
  <html lang="es" dir="ltr">
  <h1>Bienvenido al Futuro</h1>
  <p>Traduce tu sitio web al instante.</p>
  <button data-no-translate>tstlai v1.0</button>
</article>
```

## Next Steps

- [Integration with Next.js](../guides/nextjs-integration.md)
- [Integration with Express](../guides/frameworks.md)
- [Redis Caching](../guides/caching.md)
