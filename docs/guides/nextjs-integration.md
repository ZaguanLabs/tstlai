# Next.js Integration

tstlai provides deep integration with Next.js (App Router).

## 0. Prerequisites: Routing & Middleware

`tstlai` does **not** handle routing. It expects your app to use dynamic route segments (e.g., `app/[locale]/page.tsx`).

You must implement a Next.js Middleware to detect the user's preferred language (via headers or IP geolocation) and redirect them to the correct locale.

### Example `src/middleware.ts`

Dependencies: `npm install negotiator @formatjs/intl-localematcher`

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';

const LOCALES = ['en', 'es', 'fr', 'de', 'it'];
const DEFAULT_LOCALE = 'en';

function getLocale(request: NextRequest): string {
  // 1. Check cookies or custom logic
  // 2. Use Negotiator to check Accept-Language header
  const headers = { 'accept-language': request.headers.get('accept-language') || '' };
  const languages = new Negotiator({ headers }).languages();

  return match(languages, LOCALES, DEFAULT_LOCALE);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if pathname already has a locale
  const pathnameHasLocale = LOCALES.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );

  if (pathnameHasLocale) return;

  // Redirect if no locale found
  const locale = getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: [
    // Skip internal paths
    '/((?!_next|api|favicon.ico|.*\\..*).*)',
  ],
};
```

## 1. Critical Setup: Separation of Concerns

**Important:** You must split your configuration into two files.

- `translator.ts`: Server-only (imports `tstlai`, Redis, OpenAI).
- `translator-client.ts`: Client-only (imports `tstlai/client`).

If you mix these, `ioredis` will try to bundle on the client and crash your build.

### Server Configuration (`src/lib/translator.ts`)

Use a singleton pattern to prevent creating new Redis connections on every request.

```typescript
import 'server-only';
import { Tstlai, integrations } from 'tstlai';

// Singleton cache for translator instances per locale
// Prevents creating new Redis connections on every request
const instances = new Map<string, Tstlai>();

export function getTranslator(locale: string) {
  if (!instances.has(locale)) {
    instances.set(
      locale,
      new Tstlai({
        targetLang: locale,
        provider: {
          type: 'openai',
          apiKey: process.env.OPENAI_API_KEY,
          timeout: 30000, // 30s fail-open timeout
        },
        cache: {
          type: 'redis',
          connectionString: process.env.REDIS_URL,
        },
        excludedTerms: ['MyBrandName', 'Next.js'], // Protect your brand
        translationContext: 'Marketing website for B2B SaaS', // Context for AI
      }),
    );
  }
  return instances.get(locale)!;
}

// Helper for Server Components
export async function getTranslations(locale: string) {
  const translator = getTranslator(locale);

  // Create adapter linked to your source language (e.g., en.json)
  const { getTranslations } = integrations.createNextIntlAdapter(
    translator,
    require(`../../messages/en.json`), // Source of truth
  );
  return getTranslations(locale);
}

// Helper for Client Hydration
export async function getMessages(locale: string) {
  const translator = getTranslator(locale);
  const { getMessages } = integrations.createNextIntlAdapter(
    translator,
    require(`../../messages/en.json`),
  );
  return getMessages(locale);
}
```

### Client Configuration (`src/lib/translator-client.ts`)

```typescript
'use client';

// Re-export client components from the safe entry point
export { TstlaiProvider, useTranslations } from 'tstlai/client';
```

## 2. Server Components (RSC)

Use `getTranslations` from your **server** file.

```tsx
// src/app/[locale]/page.tsx
import { getTranslations } from '@/lib/translator';

export default async function Page({ params: { locale } }) {
  const t = await getTranslations(locale);

  return <h1>{t('hero.title')}</h1>;
}
```

## 3. Client Components

### Step A: Provider in Layout

Import `getMessages` from **server** file and `TstlaiProvider` from **client** file.

```tsx
// src/app/[locale]/layout.tsx
import { getMessages } from '@/lib/translator'; // Server
import { TstlaiProvider } from '@/lib/translator-client'; // Client

export default async function Layout({ children, params: { locale } }) {
  const messages = await getMessages(locale);

  return (
    <TstlaiProvider locale={locale} initialMessages={messages}>
      {children}
    </TstlaiProvider>
  );
}
```

### Step B: useTranslations Hook

Import `useTranslations` from your **client** file.

**Note:** Unlike `next-intl`, `useTranslations` does **not** support namespace arguments. You must use the full dot-notation key.

```tsx
// src/components/MyComponent.tsx
'use client';
import { useTranslations } from '@/lib/translator-client';
import { interpolate } from '@/lib/utils'; // See helper below

export function MyComponent() {
  const t = useTranslations();

  // ✅ Correct
  const title = t('home.hero.title');

  // ❌ Incorrect (Namespace not supported)
  // const t = useTranslations('home.hero');
  // const title = t('title');

  return (
    <div>
      <h1>{title}</h1>
      <p>{interpolate(t('home.welcome'), { name: 'Steve' })}</p>
    </div>
  );
}
```

### Step C: Interpolation Helper

The standard `t()` function returns raw strings. For variable interpolation (e.g. `Hello {name}`), use a helper:

```typescript
// src/lib/utils.ts
export function interpolate(str: string, values: Record<string, string | number>): string {
  return str.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}
```

## 4. HTML Translation (Static Pages)

For large static content (like Privacy Policy), translating HTML structure is often easier than maintaining hundreds of keys.

Reuse the `getTranslator` helper to ensure you use the shared cache/connection.

```typescript
import { getTranslator } from '@/lib/translator';

export default async function PrivacyPage({ params: { locale } }) {
  const translator = getTranslator(locale);

  const rawHtml = `<h1>Privacy Policy</h1><p>...</p>`;
  const { html } = await translator.process(rawHtml);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```
