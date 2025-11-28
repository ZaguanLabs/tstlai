# Quick Start: Zero to Translated in 5 Minutes

This guide gets you from `npm install` to a fully translated Next.js app in under 5 minutes using the **Auto-Translate** method. No JSON files, no string extraction, no refactoring.

## Prerequisites

- Next.js 14+ (App Router)
- An OpenAI API key (or compatible endpoint)

## Step 1: Install

```bash
npm install tstlai
```

## Step 2: Set Environment Variables

```bash
# .env.local
OPENAI_API_KEY=sk-...
```

## Step 3: Create the Translator (Server-Side)

Create `src/lib/translator.ts`:

```typescript
import 'server-only';
import { Tstlai } from 'tstlai';

let instance: Tstlai | null = null;

export function getTranslator() {
  if (!instance) {
    instance = new Tstlai({
      targetLang: 'en', // Default, will be overridden per-request
      provider: {
        type: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
      },
      cache: { type: 'memory' }, // Use 'redis' in production
    });
  }
  return instance;
}
```

## Step 4: Create the API Endpoint

Create `src/app/api/tstlai/translate/route.ts`:

```typescript
import { createNextRouteHandler } from 'tstlai/next';
import { getTranslator } from '@/lib/translator';

export const POST = createNextRouteHandler(getTranslator());
```

## Step 5: Add Auto-Translate to Your Layout

Edit your `src/app/layout.tsx` (or `src/app/[locale]/layout.tsx`):

```tsx
import { AutoTranslate } from 'tstlai/integrations';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Get locale from URL, cookie, or header (your choice)
  const locale = 'es'; // Example: Spanish

  return (
    <html lang={locale}>
      <body>
        {children}
        {/* This single line translates your entire app */}
        <AutoTranslate targetLang={locale} />
      </body>
    </html>
  );
}
```

## Step 6: Run Your App

```bash
npm run dev
```

Visit your app. The page will load in English, then smoothly update to Spanish as translations stream in.

---

## What Just Happened?

1. Your page rendered normally (in English).
2. `<AutoTranslate>` scanned the DOM for text nodes.
3. It sent them to `/api/tstlai/translate`.
4. The API translated them via OpenAI and cached the results.
5. The component updated the DOM with translated text.

**On subsequent visits**, translations are served instantly from cache.

---

## Next Steps

| Goal                          | Guide                                                                                                |
| :---------------------------- | :--------------------------------------------------------------------------------------------------- |
| **Faster initial load (SEO)** | Use [Page Translations](../guides/nextjs-integration.md#4-method-b-page-translations-no-json-files)  |
| **Production caching**        | [Configure Redis](../guides/caching.md)                                                              |
| **Migrate from next-intl**    | Use [JSON Adapter](../guides/nextjs-integration.md#5-method-c-json-adapter-seo--next-intl-migration) |
