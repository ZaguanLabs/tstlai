# Next.js Integration

tstlai provides deep integration with Next.js (App Router).

> **Important:** Async Server Components block the entire page render until they complete. For the best user experience, always use Suspense boundaries to show content immediately while translations load. See [Suspense & Progressive Enhancement](#7-suspense--progressive-enhancement) for details.

## 1. Choose Your Method

| Method                | Setup Time | Best For                                  | Trade-off               |
| :-------------------- | :--------- | :---------------------------------------- | :---------------------- |
| **Auto-Translate**    | 2 min      | Legacy apps, rapid prototyping            | Small client-side flash |
| **Page Translations** | 5 min      | New projects, dashboards                  | List strings upfront    |
| **JSON Adapter**      | 10 min     | SEO-critical pages, `next-intl` migration | Requires JSON files     |

**Recommendation:** Start with **Auto-Translate** to see it working, then use **Page Translations** for production pages.

---

## 2. Shared Setup

Create `src/lib/translator.ts`:

```typescript
import 'server-only';
import { Tstlai } from 'tstlai';

const instances = new Map<string, Tstlai>();

export function getTranslator(locale: string = 'en') {
  if (!instances.has(locale)) {
    instances.set(
      locale,
      new Tstlai({
        targetLang: locale,
        provider: {
          type: 'openai',
          apiKey: process.env.OPENAI_API_KEY,
        },
        cache: {
          type: process.env.REDIS_URL ? 'redis' : 'memory',
          connectionString: process.env.REDIS_URL,
        },
        excludedTerms: ['MyBrandName'], // Protect brand names
      }),
    );
  }
  return instances.get(locale)!;
}
```

---

## 3. Method A: Auto-Translate (Easiest)

**Zero refactoring.** Drop one component into your layout and your entire app is translated.

### Step 1: Create API Endpoint

```typescript
// src/app/api/tstlai/translate/route.ts
import { createNextRouteHandler } from 'tstlai/next';
import { getTranslator } from '@/lib/translator';

export const POST = createNextRouteHandler(getTranslator());
```

### Step 2: Add to Layout

```tsx
// src/app/[locale]/layout.tsx
import { AutoTranslate } from 'tstlai/integrations';

export default async function Layout({ children, params }) {
  const { locale } = await params;

  return (
    <html lang={locale}>
      <body>
        {children}
        <AutoTranslate targetLang={locale} />
      </body>
    </html>
  );
}
```

**Done!** Visit `/es` and watch your page translate automatically.

---

## 4. Method B: Page Translations (No JSON Files)

Pre-translate all page strings in a single batch call. No JSON files, no render blocking.

```tsx
// src/app/[locale]/dashboard/page.tsx
import { getTranslator } from '@/lib/translator';
import { createPageTranslations } from 'tstlai/next';

export default async function Dashboard({ params }) {
  const { locale } = await params;

  // Single async call - translates all strings in one batch
  const t = await createPageTranslations(getTranslator(locale), [
    'Welcome back!',
    'Here is your daily summary.',
    'View Reports',
  ]);

  // Synchronous rendering - no blocking
  return (
    <div>
      <h1>{t('Welcome back!')}</h1>
      <p>{t('Here is your daily summary.')}</p>
      <button>{t('View Reports')}</button>
    </div>
  );
}
```

**Why this approach?**

- ✅ Single API call (batched)
- ✅ Full SSR (SEO-friendly)
- ✅ No render blocking
- ✅ Strings live in your code, not JSON files

---

## 5. Method C: JSON Adapter (SEO / next-intl Migration)

Use your existing `messages/en.json` as the source of truth.

```tsx
// src/app/[locale]/page.tsx
import { getTranslator } from '@/lib/translator';
import { createNextIntlAdapter } from 'tstlai/integrations';
import enMessages from '@/messages/en.json';

export default async function Page({ params }) {
  const { locale } = await params;
  const adapter = createNextIntlAdapter(getTranslator(locale), enMessages);
  const t = await adapter.getTranslations(locale);

  return <h1>{t('hero.title')}</h1>;
}
```

---

## 6. HTML Processing (Static Pages)

For **Privacy Policies, Terms of Service, and Blog Posts**, translate raw HTML directly.

```typescript
// src/app/[locale]/privacy/page.tsx
import { getTranslator } from '@/lib/translator';

const PRIVACY_HTML = `
  <h1>Privacy Policy</h1>
  <p>We value your data...</p>
`;

export default async function PrivacyPage({ params }) {
  const { locale } = await params;
  const { html } = await getTranslator(locale).process(PRIVACY_HTML);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```

---

## 7. Suspense & Progressive Enhancement

Without Suspense, async Server Components block the entire page render until translations complete. This can mean **10-30 seconds of blank screen** on first visit for uncached translations.

### The Problem

```tsx
// ❌ BAD: Blocks entire page render
export default async function Layout({ children, params }) {
  const { locale } = await params;
  const messages = await translateMessages(enMessages, locale); // Blocks here!

  return (
    <TstlaiProvider locale={locale} initialMessages={messages}>
      {children}
    </TstlaiProvider>
  );
}
```

### The Solution: TstlaiSuspenseProvider

Use `TstlaiSuspenseProvider` to show English content immediately while translations load in the background:

```tsx
// ✅ GOOD: Shows English immediately, swaps in translations when ready
import { TstlaiSuspenseProvider } from 'tstlai/client';
import { getTranslator } from '@/lib/translator';
import enMessages from '@/messages/en.json';

// Helper to translate all messages
async function translateMessages(
  messages: Record<string, any>,
  locale: string,
): Promise<Record<string, any>> {
  if (locale === 'en') return messages;

  const translator = getTranslator(locale);
  // ... recursive translation logic
  return translatedMessages;
}

export default async function Layout({ children, params }) {
  const { locale } = await params;

  // Start translation (returns a Promise)
  const translatedMessages = translateMessages(enMessages, locale);

  return (
    <TstlaiSuspenseProvider
      locale={locale}
      fallbackLocale="en"
      fallbackMessages={enMessages}
      translatedMessages={translatedMessages}
    >
      {children}
    </TstlaiSuspenseProvider>
  );
}
```

### User Experience Timeline

```
T+0ms:    Page loads with English content (instant)
T+100ms:  User can read and interact
T+15-30s: Translations swap in seamlessly (first visit, uncached)
T+50ms:   Cached translations appear (subsequent visits)
```

### Translation Status Indicator

Show users that translations are loading with `useTranslationStatus`:

```tsx
'use client';

import { useTranslationStatus } from 'tstlai/client';

export function TranslationIndicator() {
  const { isTranslating, progress } = useTranslationStatus();

  if (!isTranslating) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-full text-sm">
      Translating...
    </div>
  );
}
```

### Page-Level Suspense

For page content, wrap async translation components in their own Suspense boundaries:

```tsx
import { Suspense } from 'react';
import { createPageTranslations } from 'tstlai/next';
import { getTranslator } from '@/lib/translator';

const PAGE_STRINGS = ['Welcome to our site', 'Get started today'] as const;

async function TranslatedContent({ locale }: { locale: string }) {
  const t = await createPageTranslations(
    getTranslator(locale),
    PAGE_STRINGS as unknown as string[],
  );

  return (
    <main>
      <h1>{t('Welcome to our site')}</h1>
      <p>{t('Get started today')}</p>
    </main>
  );
}

// Fallback shows English content (not a loading spinner!)
function FallbackContent() {
  return (
    <main>
      <h1>Welcome to our site</h1>
      <p>Get started today</p>
    </main>
  );
}

export default async function Page({ params }) {
  const { locale } = await params;

  return (
    <Suspense fallback={<FallbackContent />}>
      <TranslatedContent locale={locale} />
    </Suspense>
  );
}
```

> **Key Insight:** A blank loading state is worse than showing source content. Users can read and interact with English content while translations load.

---

## Appendix: Locale Routing

`tstlai` does **not** handle routing. You need middleware to detect the user's locale and redirect to `/[locale]/...`.

<details>
<summary>Example Middleware (click to expand)</summary>

Dependencies: `npm install negotiator @formatjs/intl-localematcher`

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';

const LOCALES = ['en', 'es', 'fr', 'de'];
const DEFAULT_LOCALE = 'en';

function getLocale(request: NextRequest): string {
  const headers = { 'accept-language': request.headers.get('accept-language') || '' };
  const languages = new Negotiator({ headers }).languages();
  return match(languages, LOCALES, DEFAULT_LOCALE);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const pathnameHasLocale = LOCALES.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );

  if (pathnameHasLocale) return;

  const locale = getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
};
```

</details>
