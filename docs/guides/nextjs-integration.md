# Next.js Integration

tstlai provides deep integration with Next.js (App Router), allowing for Server Components translation, Client Component hydration, and `next-intl` compatibility.

## 1. Setup

First, create a shared translator instance (e.g., in `src/lib/tstlai.ts`).

```typescript
import { Tstlai, integrations } from 'tstlai';

// Initialize core engine
const translator = new Tstlai({ 
  targetLang: 'en', // Default, will be overridden dynamically
  provider: { type: 'openai' },
  cache: { type: 'redis', connectionString: process.env.REDIS_URL }
});

// Export Next.js helpers
export const { Translate } = integrations.createNextIntegration(translator);
export const { getTranslations, getMessages } = integrations.createNextIntlAdapter(
  translator, 
  require('../../messages/en.json') // Your source of truth
);
```

## 2. Server Components (RSC)

The most efficient way to translate is in Server Components using `getTranslations`. This works exactly like `next-intl`.

```tsx
// src/app/[locale]/page.tsx
import { getTranslations } from '@/lib/tstlai';

export default async function Page({ params: { locale } }) {
  const t = await getTranslations(locale);
  
  return (
    <main>
      <h1>{t('hero.title')}</h1>
      <p>{t('hero.description')}</p>
    </main>
  );
}
```

### Inline Translation Component
For simple strings or when you don't have a JSON key, use the `<Translate>` component.

```tsx
import { Translate } from '@/lib/tstlai';

<h1><Translate>Welcome to our site</Translate></h1>
```

## 3. Client Components

To use translations in Client Components (`'use client'`), you need to hydrate the translations from the server.

### Step A: Add Provider to Layout
Fetch the messages on the server and pass them to the provider.

```tsx
// src/app/[locale]/layout.tsx
import { TstlaiProvider } from 'tstlai/client';
import { getMessages } from '@/lib/tstlai';

export default async function LocaleLayout({ children, params: { locale } }) {
  const messages = await getMessages(locale);
  
  return (
    <TstlaiProvider locale={locale} initialMessages={messages}>
      {children}
    </TstlaiProvider>
  );
}
```

### Step B: Use Hook in Component

```tsx
// src/components/navbar.tsx
'use client';
import { useTranslations } from 'tstlai/client';

export function Navbar() {
  const t = useTranslations();
  return <nav>{t('nav.home')}</nav>;
}
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
