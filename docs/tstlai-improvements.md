# tstlai Improvement Plan

Based on the integration experience with Content Refinery (Next.js App Router), we have identified several key areas to evolve `tstlai` from a library into a complete robust internationalization platform.

## 1. First-Class Next.js Integration

The current "copy-paste" integration and props drilling for Client Components is functional but frictional. We aim to make `tstlai` feel native to Next.js.

### 1.1 Client-Side Hydration
**Problem:** Client components cannot use `async` translation, forcing developers to drill props from Server Components.
**Solution:** Implement a `TstlaiProvider` that dehydrates translations from the server and hydrates a context on the client.

```tsx
// layout.tsx (Server)
import { TstlaiProvider } from 'tstlai/next';

export default async function Layout({ children, params: { locale } }) {
  const translations = await getTranslationsForRoute(locale); // Smart pre-fetching
  return (
    <TstlaiProvider locale={locale} initialMessages={translations}>
      {children}
    </TstlaiProvider>
  );
}

// component.tsx (Client)
'use client';
import { useTranslations } from 'tstlai/client';

export function Navbar() {
  const t = useTranslations(); // Sync, hydrated from context
  return <nav>{t('nav.home')}</nav>;
}
```

### 1.2 Static Content Helper
**Problem:** `renderToString` does not work in Next.js App Router for converting components to HTML for translation.
**Solution:** Provide a `TranslateHTML` server component that handles raw HTML translation cleanly.

```tsx
import { TranslateHTML } from 'tstlai/next';

export default function PrivacyPage() {
  return (
    <TranslateHTML>
      {`<h1>Privacy Policy</h1><p>...</p>`}
    </TranslateHTML>
  );
}
```

## 2. Performance & Scaling

### 2.1 CLI for Cache Warming
**Problem:** The first visitor to a new language faces a 2-3s delay.
**Solution:** A CLI tool to pre-translate critical paths during build/deploy.

```bash
# package.json
"scripts": {
  "tstlai:warm": "tstlai warm --locales=es,fr,de --file=messages/en.json"
}
```

### 2.2 Streaming Translation
**Problem:** Large batches block rendering until all strings are translated.
**Solution:** Implement a streaming API that yields translations as they arrive, allowing for progressive UI updates (mostly useful for custom implementations, as React `use` handles promises well).

## 3. Resilience & Quality

### 3.1 Fallback Chains
**Problem:** If a translation fails, it falls back to English.
**Solution:** Configurable fallback chains (e.g., `pt-BR` -> `pt` -> `es` -> `en`).

### 3.2 Glossary / Context Support
**Problem:** Brand names or specific terms might be translated incorrectly.
**Solution:** Support a `glossary` in configuration to force specific translations.

```typescript
const translator = new Tstlai({
  // ...
  glossary: {
    'Content Refinery': 'Content Refinery', // Do not translate
    'AI': 'IA' // Force specific acronym in Spanish/French
  }
});
```

## 4. Developer Experience

### 4.1 Debug / Preview Mode
**Problem:** It's hard to know which key corresponds to which text on the screen.
**Solution:** A "Visual Edit" mode where hovering over translated text shows the original key and source text.

```tsx
// Enabled via config or env var
<TstlaiProvider debug={true}>
```

### 4.2 Linter Plugin
**Problem:** Hardcoded strings in JSX are missed.
**Solution:** An ESLint plugin `eslint-plugin-tstlai` to detect text requiring translation.

## Roadmap Priorities

1.  **High**: Next.js Client-Side Hydration (fixes the biggest DX pain point).
2.  **High**: CLI Cache Warmer (fixes the biggest UX pain point).
3.  **Medium**: Fallback Chains & Glossary.
4.  **Low**: Linter & Visual Debugger.
