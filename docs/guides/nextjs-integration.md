# Next.js Integration

tstlai provides deep integration with Next.js (App Router).

## 1. Critical Setup: Separation of Concerns

**Important:** You must split your configuration into two files.

- `translator.ts`: Server-only (imports `tstlai`, Redis, OpenAI).
- `translator-client.ts`: Client-only (imports `tstlai/client`).

If you mix these, `ioredis` will try to bundle on the client and crash your build.

### Server Configuration (`src/lib/translator.ts`)

```typescript
import 'server-only'; // Optional but recommended
import { Tstlai, integrations } from 'tstlai';

// Initialize core engine (Server Only)
const translator = new Tstlai({
  targetLang: 'en',
  provider: { type: 'openai' },
  cache: { type: 'redis', connectionString: process.env.REDIS_URL },
});

// Export Server Helpers
export const { Translate } = integrations.createNextIntegration(translator);
export const { getTranslations, getMessages } = integrations.createNextIntlAdapter(
  translator,
  require('../../messages/en.json'), // Source of truth
);
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

  return <h1>{t('hero.title')}</h1>; // Works like next-intl
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

export function MyComponent() {
  const t = useTranslations();

  // ✅ Correct
  const title = t('home.hero.title');

  // ❌ Incorrect (Namespace not supported)
  // const t = useTranslations('home.hero');
  // const title = t('title');

  return <div>{title}</div>;
}
```

### Step C: Variable Interpolation

The standard `t()` function returns raw strings. For variable interpolation (e.g. `Hello {name}`), use a helper:

```typescript
// src/lib/utils.ts
export function interpolate(str: string, values: Record<string, string | number>): string {
  return str.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}
```

Usage:

```tsx
import { interpolate } from '@/lib/utils';

// t('welcome') -> "Hello {name}"
<span>{interpolate(t('welcome'), { name: 'Steve' })}</span>;
```

## 4. HTML Translation (Static Pages)

For large static content (like Privacy Policy), translating HTML structure is often easier than maintaining hundreds of keys.

```typescript
import { Tstlai } from 'tstlai';

export default async function PrivacyPage({ params: { locale } }) {
  const translator = new Tstlai({ targetLang: locale, ...config });

  const rawHtml = `<h1>Privacy Policy</h1><p>...</p>`;
  const { html } = await translator.process(rawHtml);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```
