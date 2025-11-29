# tstlai: Just-In-Time AI Localization

**tstlai** is middleware for **Just-In-Time AI localization** with intelligent caching to minimize costs and latency.

> **Philosophy:** Don't pay to translate the same string twice.

## Features

- **Zero-Config** — No translation files to maintain
- **Cost-Efficient** — Smart caching (Redis/Memory) means you pay once per unique string
- **HTML-Safe** — Only text is translated; structure, classes, and attributes stay intact
- **Context-Aware** — AI adapts tone for your domain (Marketing, Legal, etc.)
- **RTL Support** — Automatic detection for Arabic, Hebrew, Persian, etc.
- **CLI Generation** — Generate static translation files at build time

## Installation

```bash
npm install tstlai
```

## Quick Start

```typescript
import { Tstlai } from 'tstlai';

const translator = new Tstlai({
  targetLang: 'es',
  provider: { type: 'openai', apiKey: process.env.OPENAI_API_KEY },
  cache: { type: 'memory' },
});

// Translate text
const translated = await translator.translateText('Hello, world!');

// Or process full HTML
const result = await translator.process('<h1>Hello</h1>');
console.log(result.html); // <h1>Hola</h1>
```

## Documentation

| Guide                                                        | Description                                |
| :----------------------------------------------------------- | :----------------------------------------- |
| **[Quick Start](docs/getting-started/quick-start.md)**       | 5 minutes to a translated app              |
| **[Configuration](docs/api/configuration.md)**               | All options, env vars, caching             |
| **[Next.js Integration](docs/guides/nextjs-integration.md)** | Auto-translate, SSR, `next-intl` migration |
| **[CLI Generate](docs/guides/cli-generate.md)**              | Static file generation for CI/CD           |
| **[Frameworks](docs/guides/frameworks.md)**                  | Express, Fastify, Astro, Remix             |
| **[Caching](docs/guides/caching.md)**                        | Redis setup, multi-language keys           |

## Integration Methods

| Method                | Best For                   | Setup                 |
| :-------------------- | :------------------------- | :-------------------- |
| **Auto-Translate**    | Legacy apps, fastest setup | Drop-in component     |
| **Page Translations** | New projects               | List strings upfront  |
| **JSON Adapter**      | `next-intl` migration      | Use existing JSON     |
| **CLI Generate**      | Static sites, mobile apps  | Build-time generation |

## Environment Variables

| Variable          | Description      | Default                     |
| :---------------- | :--------------- | :-------------------------- |
| `OPENAI_API_KEY`  | OpenAI API Key   | —                           |
| `OPENAI_MODEL`    | Model ID         | `gpt-3.5-turbo`             |
| `OPENAI_BASE_URL` | Custom endpoint  | `https://api.openai.com/v1` |
| `REDIS_URL`       | Redis connection | `redis://localhost:6379`    |

## CLI

```bash
# Generate Spanish and French from English source
npx tstlai generate -i locales/en.json -o locales/ -l es,fr

# With context for better quality
npx tstlai generate -i en.json -l de,ja -c "E-commerce website"
```

## Preventing Translation

```html
<span data-no-translate>BrandName™</span>
```

Or use `excludedTerms` in config for global exclusions.

## License

MIT
