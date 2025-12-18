# tstlai: Just-In-Time AI Localization

**tstlai** is middleware for **Just-In-Time AI localization** with intelligent caching to minimize costs and latency.

## Why tstlai?

Traditional i18n requires maintaining separate JSON files for each language - extracting strings, syncing changes across files, and coordinating with translators. As your app grows, this becomes a maintenance burden that slows down development.

tstlai takes a different approach:

- **One source of truth** - Maintain a single JSON file or write inline. Either way, you never sync multiple language files.
- **Add languages instantly** - One line of config. No translation workflow, no waiting on translators.
- **Context-aware accuracy** - Unlike standard auto-translation, AI understands context. "Save" translates correctly whether it's a button, a discount, or a rescue mission.
- **Pay once per string** - Intelligent caching means each unique string is translated only once.

## How It Works

1. You write your app in your source language
2. tstlai intercepts text at render time (or build time)
3. New strings are translated via AI and cached
4. Cached translations are served instantly on subsequent requests

The result: your app supports any language without changing your development workflow.

## Features

- **HTML-Safe** - Only text nodes are translated; structure, classes, and attributes stay intact
- **RTL Support** - Automatic `dir` and `lang` attributes for Arabic, Hebrew, Persian, etc.
- **Flexible Caching** - Redis for production, in-memory for development
- **Multiple Integration Modes** - Auto-translate, server-side, or CLI generation at build time
- **Framework Support** - Next.js, Express, Fastify, Astro, Remix

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

## Security

tstlai includes built-in protections and provides guidance for secure deployments:

### Built-in Protections

- **XSS Safe** - Translations are applied via `textContent`, not `innerHTML`
- **Request Limits** - Route handlers enforce default limits (100 texts, 100K chars per request)
- **Production Warnings** - Console warnings alert you to add rate limiting

### Safest Option: Server-Side Only

Use `createPageTranslations` or `CLI generate` to avoid exposing any public endpoint:

```typescript
// No public API needed—runs entirely on your server
const t = await createPageTranslations(translator, ['Welcome', 'About us']);
return <h1>{t('Welcome')}</h1>;
```

### If Using Client-Side Translation

When exposing translation endpoints (e.g., for `AutoTranslate`), you **must** implement:

- **Rate limiting** - Prevent API abuse and cost overruns
- **Origin validation** - Restrict access to your domains
- **Monitoring** - Track usage and set billing alerts with your AI provider

```typescript
// Example: Customize limits
export const POST = createNextRouteHandler(translator, {
  maxTexts: 50, // Stricter limit
  maxTotalChars: 25000,
});
```

> ⚠️ **Without rate limiting, your endpoint is exploitable.** An attacker can use your AI credits for free translations.

📖 **[Full Security Guide](docs/guides/security.md)** - Rate limiting examples, origin validation, complete protected route implementation.

## License

MIT

---

_tstlai is developed by [Zaguán AI](https://zaguanai.com/), a 100% OpenAI-compatible API that makes it easy to switch between models._
