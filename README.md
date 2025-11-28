# tstlai: Just-In-Time Web Localization Engine

**tstlai** (TypeScript Translation AI) is a middleware for **Just-In-Time AI localization**. It features an intelligent caching layer to minimize token costs and latency.

**Philosophy:** Don't pay to translate the same string twice.

Unlike traditional i18n libraries that require maintaining massive JSON files, `tstlai` intercepts your HTML, extracts the text, and uses AI to provide context-aware translations on the fly, serving repeated requests instantly from cache.

## 🚀 Features

- **Zero-Config Translation**: No manual translation files. Content is translated as it is rendered.
- **Fail-Open Architecture**: If the AI provider fails or times out, the original content is served immediately.
- **Cost-Efficient**: Smart caching (Redis/Memory) ensures you only pay for unique string translations once.
- **HTML-Safe**: Intelligent parsing ensures your HTML structure, classes, and attributes remain untouched. Only text content is translated.
- **Context-Aware**: AI understands your content's context (e.g., "Marketing", "Legal") for native-quality phrasing.
- **RTL Support**: Automatically detects Right-to-Left languages (like Arabic, Hebrew) and sets the `dir="rtl"` attribute.

## 📦 Installation

```bash
npm install tstlai
```

## ⚡ Quick Start (Next.js)

The fastest way to get started is with the **Auto-Translate** component. It scans your page and translates everything automatically—no refactoring required.

**1. Create API Route** (`src/app/api/tstlai/translate/route.ts`):

```typescript
import { Tstlai } from 'tstlai';
import { createNextRouteHandler } from 'tstlai/next';

const translator = new Tstlai({
  targetLang: 'en',
  provider: { type: 'openai', apiKey: process.env.OPENAI_API_KEY },
  cache: { type: 'memory' },
});

export const POST = createNextRouteHandler(translator);
```

**2. Add to Layout** (`src/app/layout.tsx`):

```tsx
import { AutoTranslate } from 'tstlai/integrations';

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        {children}
        <AutoTranslate targetLang="es" />
      </body>
    </html>
  );
}
```

**That's it!** Your entire app is now translated to Spanish.

👉 **[Full Quick Start Guide](docs/getting-started/quick-start.md)** — 5 minutes to a fully translated app.

---

## 🎯 Choose Your Integration Method

| Method             | Best For                                  | Refactoring?        |
| :----------------- | :---------------------------------------- | :------------------ |
| **Auto-Translate** | Fastest setup, legacy apps                | None                |
| **JIT Components** | New projects, dashboards                  | Minimal (wrap text) |
| **JSON Adapter**   | SEO-critical pages, `next-intl` migration | Use existing JSON   |

👉 **[Next.js Integration Guide](docs/guides/nextjs-integration.md)**

---

## 🛠️ How It Works

1.  **Parse**: The engine parses the incoming HTML and extracts text nodes. It automatically ignores non-content tags.
2.  **Hash & Check**: Each text segment is hashed. The system checks the cache for existing translations to save costs and reduce latency.
3.  **Translate**: Cache misses are batched and sent to the AI provider in a single request.
4.  **Reconstruct**: The translated text is injected back into the DOM, preserving the original layout perfectly.

## ⚙️ Configuration

The `Tstlai` constructor accepts a configuration object:

| Option               | Type       | Description                                                                    |
| -------------------- | ---------- | ------------------------------------------------------------------------------ |
| `targetLang`         | `string`   | The ISO language code to translate to (e.g., 'es', 'fr', 'jp').                |
| `provider`           | `object`   | Configuration for the AI provider (API key, model, etc.).                      |
| `cache`              | `object`   | Cache strategy configuration. Supports `memory` (default) and `redis`.         |
| `excludedTerms`      | `string[]` | List of words/phrases to exclude from translation.                             |
| `translationContext` | `string`   | Description of context (e.g., "B2B Marketing") to improve translation quality. |

### Redis Caching

To use Redis, provide the `connectionString` or set `REDIS_URL` env var.

```typescript
const translator = new Tstlai({
  // ...
  cache: {
    type: 'redis',
    connectionString: 'redis://localhost:6379', // or 'redis+socket:///tmp/redis.sock'
    ttl: 86400, // 24 hours
    keyPrefix: 'tstlai:', // Default namespace
  },
});
```

**Multi-Language Support**: `tstlai` automatically generates cache keys using the format `tstlai:<hash>:<lang>`. This means translations for different languages (e.g., French vs Spanish) are stored separately and will never collide.

### Environment Variables

You can configure the OpenAI provider using standard environment variables:

| Variable          | Description             | Default                     |
| ----------------- | ----------------------- | --------------------------- |
| `OPENAI_API_KEY`  | Your OpenAI API Key     | `undefined`                 |
| `OPENAI_MODEL`    | The model to use        | `gpt-3.5-turbo`             |
| `OPENAI_BASE_URL` | Custom API endpoint     | `https://api.openai.com/v1` |
| `REDIS_URL`       | Redis connection string | `redis://localhost:6379`    |

## � Framework Integration

### Express / Node.js Middleware

To automatically translate all HTML responses in an Express app:

```typescript
import express from 'express';
import { Tstlai, integrations } from 'tstlai';

const app = express();
const translator = new Tstlai({ targetLang: 'es', provider: { type: 'openai' } });

// Apply middleware
app.use(integrations.createExpressMiddleware(translator));

app.get('/', (req, res) => {
  res.send('<h1>Hello World</h1>'); // Automatically translated to <h1>Hola Mundo</h1>
});
```

### Next.js (App Router)

For Next.js App Router, use the provided Server Component wrapper to ensure hydration safety.

1. Create a shared instance:

```typescript
// src/lib/tstlai.ts
import { Tstlai, integrations } from 'tstlai';

const translator = new Tstlai({ targetLang: 'es', provider: { type: 'openai' } });
export const { Translate } = integrations.createNextIntegration(translator);
```

2. Use in your components:

```tsx
import { Translate } from '@/lib/tstlai';

export default function Page() {
  return (
    <main>
      <h1>
        <Translate>Welcome to Next.js</Translate>
      </h1>
      <p>
        <Translate>This text is translated on the server.</Translate>
      </p>
    </main>
  );
}
```

### Next.js (`next-intl` Compatible)

Migration from `next-intl` is zero-effort. Use your existing `en.json` as the source of truth.

1. Create the adapter:

```typescript
// src/i18n.ts
import { Tstlai, integrations } from 'tstlai';
import enMessages from '../messages/en.json';

const translator = new Tstlai({ targetLang: 'en', provider: { type: 'openai' } });
export const { getTranslations } = integrations.createNextIntlAdapter(translator, enMessages);
```

2. Use in Server Components (just like `next-intl`):

```tsx
import { getTranslations } from '@/i18n';

export default async function Page({ params: { locale } }) {
  const t = await getTranslations(locale);

  return <h1>{t('landing.hero.title')}</h1>;
}
```

### Client-Side Hydration (Recommended)

To use `useTranslations` in Client Components without props drilling, add the `TstlaiProvider`.

1. **Server Layout (`layout.tsx`):**

```tsx
import { TstlaiProvider } from 'tstlai/client';
import { getTranslations } from '@/lib/translator';

export default async function Layout({ children, params: { locale } }) {
  // Fetch raw messages object for hydration
  const messages = await (await getTranslations(locale)).messages; // Or use getMessages if available

  return (
    <TstlaiProvider locale={locale} initialMessages={messages}>
      {children}
    </TstlaiProvider>
  );
}
```

2. **Client Component (`navbar.tsx`):**

```tsx
'use client';
import { useTranslations } from 'tstlai/client';

export function Navbar() {
  const t = useTranslations();
  return <nav>{t('nav.home')}</nav>;
}
```

### Fastify Plugin

```typescript
import Fastify from 'fastify';
import { Tstlai, integrations } from 'tstlai';

const fastify = Fastify();
const translator = new Tstlai({ targetLang: 'fr', provider: { type: 'openai' } });

fastify.register(integrations.createFastifyPlugin(translator));
```

### Astro Middleware

```typescript
// src/middleware.ts
import { Tstlai, integrations } from 'tstlai';

const translator = new Tstlai({ targetLang: 'es', provider: { type: 'openai' } });

export const onRequest = integrations.createAstroMiddleware(translator);
```

### Remix Handler

Wrap your `handleRequest` in `entry.server.tsx`:

```typescript
// app/entry.server.tsx
import { Tstlai, integrations } from 'tstlai';

const translator = new Tstlai({ targetLang: 'de', provider: { type: 'openai' } });

export default integrations.createRemixHandler(translator, function handleRequest(...) {
  // ... your original logic ...
});
```

## 🛡️ Preventing Translation

To prevent specific elements from being translated, add the `data-no-translate` attribute to any HTML tag:

```html
<span data-no-translate>BrandName™</span>
```

## License

MIT
