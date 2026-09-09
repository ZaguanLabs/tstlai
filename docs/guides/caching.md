# Caching Strategies

tstlai relies heavily on caching to ensure production performance and minimize AI costs.

## Memory Cache (Default)

By default, tstlai uses an in-memory cache (`Map`). This is suitable for development or serverless functions with short lifespans, but not recommended for production scaling.

```typescript
const translator = new Tstlai({
  // ...
  cache: {
    type: 'memory',
    ttl: 3600, // 1 hour; 0 disables expiry
    maxEntries: 10000, // Maximum number of entries, not a byte limit
  },
});
```

Memory storage evicts the least recently used entry when full. Reads refresh
recency without extending the TTL, empty strings are valid hits, and expired
entries are pruned periodically even when they are never read again. The cleanup
timer does not keep a Node process alive. Call `translator.close()` at shutdown to
clear its timer and storage.

## Redis Cache (Recommended)

For production, use Redis. This allows translations to persist across deployments and be shared between multiple server instances.

### Configuration

```typescript
const translator = new Tstlai({
  // ...
  cache: {
    type: 'redis',
    // Connection String (supports redis:// and redis+socket://)
    connectionString: process.env.REDIS_URL,

    // Time to Live (in seconds)
    ttl: 60 * 60 * 24 * 7, // 7 days recommended

    // Namespace (optional)
    keyPrefix: 'tstlai:',
    commandTimeout: 1000, // Milliseconds; also bounds connection attempts
  },
});
```

Cache lookups use one `MGET` per scheduled batch. Writes use pipelined `SET`
commands with the configured TTL (`0` means no expiry). Redis errors and timeouts
are logged and treated as cache misses or skipped writes, so translation remains
available. Commands are not queued while Redis is disconnected; initial requests
may translate while the connection is still opening. This uses ioredis's
[command timeout and offline queue controls](https://github.com/redis/ioredis).

Custom caches implementing only `get` and `set` remain supported, with at most 16
parallel operations per scheduled batch. Optional `getMany`, `setMany`, and
`disconnect` methods enable bulk access and resource cleanup. `getMany` returns
one value or `null` per input key in the same order.

### Key Structure

tstlai uses a **Composite Key** strategy to support multiple languages safely.

Format: `{keyPrefix}v2:{configurationHash}:{contentHash}:{normalizedTargetLocale}`

Example for "Hello" (SHA-256 hash `185f...`):

- **Spanish**: `tstlai:v2:config...:185f...:es_ES` -> "Hola"
- **French**: `tstlai:v2:config...:185f...:fr_FR` -> "Bonjour"

The configuration hash covers the source locale, model, gateway base URL,
translation context, glossary, style, excluded terms, temperature, and reasoning
effort. Per-string context hints also participate in the content hash used by
`translateText()`. Surrounding whitespace is restored separately when rendering.

**Migration:** Existing entries using the old key format are left untouched and
are not reused. The first requests after upgrading will translate and populate
the new namespace; old entries expire according to their existing TTL. Use
`cacheTranslation()` and `getCachedTranslation()` rather than constructing keys
manually, and keep a separate `keyPrefix` per application or tenant.

Streaming integrations display valid string elements progressively but commit
new entries only after successfully consuming and validating the entire provider
response for that provider batch. Earlier completed batches can remain cached if a
later batch fails; provisional strings from the failing batch are never persisted.
Batch and streaming callers use this same validation and cache path.

### Multi-Tenancy (Multiple Apps on One Redis)

If you have multiple applications sharing the same Redis instance, use unique `keyPrefix` values to isolate their caches.

```typescript
// App A
cache: {
  type: 'redis',
  keyPrefix: 'app-a:'
}

// App B
cache: {
  type: 'redis',
  keyPrefix: 'app-b:'
}
```

### Cache Warming

Because cache keys are deterministic based on content, you can pre-warm the cache by running a script that iterates through your known content (e.g., `en.json`) and calls `translator.translateText()` for each target language.

## Performance: Splitting JSON Files for JIT Translation

When using **JIT (live) translation** with `TstlaiStreamingProvider`, the size of your JSON translation files directly impacts page load times. The LLM must translate the entire `sourceMessages` object before the page can render, so large files create noticeable delays.

### The Problem

A single monolithic `messages.json` with 300+ keys forces the LLM to translate everything at once, even if the current page only needs a fraction of those keys. This creates:

- **Blocking render** – users wait for the full translation to complete
- **Cumulative latency** – larger payloads = longer LLM processing time
- **Unnecessary API costs** – translating unused strings wastes tokens
- **Poor user perception** – slow time-to-first-content

### The Solution: Split by Route/Feature

Organize your translation files by page or feature:

```
messages/
├── en/
│   ├── common.json      # ~45 keys (nav, auth, common UI)
│   ├── landing.json     # ~150 keys (landing page only)
│   ├── pricing.json     # ~30 keys (pricing page only)
│   ├── workspace.json   # ~100 keys (workspace features)
│   └── settings.json    # ~30 keys (settings page only)
```

### Message Loader

Create a helper to compose message sets:

```typescript
// src/lib/messages.ts
import commonMessages from '../../messages/en/common.json';
import landingMessages from '../../messages/en/landing.json';
import pricingMessages from '../../messages/en/pricing.json';
import workspaceMessages from '../../messages/en/workspace.json';
import settingsMessages from '../../messages/en/settings.json';

export type Messages = Record<string, unknown>;

function mergeMessages(...messageSets: Messages[]): Messages {
  return messageSets.reduce((acc, messages) => ({ ...acc, ...messages }), {});
}

// Common messages (always included)
export const common = commonMessages as Messages;

// Page-specific message sets (common + page-specific)
export const landing = mergeMessages(common, landingMessages);
export const pricing = mergeMessages(common, pricingMessages);
export const workspace = mergeMessages(common, workspaceMessages);
export const settings = mergeMessages(common, workspaceMessages, settingsMessages);

// Full set for backwards compatibility
export const allMessages = mergeMessages(
  common,
  landingMessages,
  pricingMessages,
  workspaceMessages,
  settingsMessages,
);
```

### Reusable Translation Provider

```typescript
// src/components/translation-provider.tsx
'use client';

import { TstlaiStreamingProvider } from 'tstlai/client';
import { type Messages } from '@/lib/messages';

interface TranslationProviderProps {
  locale: string;
  messages: Messages;
  children: React.ReactNode;
}

export function TranslationProvider({ locale, messages, children }: TranslationProviderProps) {
  return (
    <TstlaiStreamingProvider
      locale={locale}
      sourceLocale="en"
      sourceMessages={messages}
      streamEndpoint="/api/tstlai/stream"
      streamBuffer={500}
    >
      {children}
    </TstlaiStreamingProvider>
  );
}
```

### Route-Specific Layouts (Next.js App Router)

Use route groups to scope translations to specific pages:

```
app/
├── [locale]/
│   ├── (landing)/          # Landing page group
│   │   ├── layout.tsx      # Uses `landing` messages
│   │   └── page.tsx
│   ├── (pricing)/          # Pricing group
│   │   ├── layout.tsx      # Uses `pricing` messages
│   │   └── pricing/page.tsx
│   ├── workspace/
│   │   ├── layout.tsx      # Uses `workspace` messages
│   │   ├── page.tsx
│   │   └── settings/
│   │       ├── layout.tsx  # Uses `settings` messages
│   │       └── page.tsx
```

Example layout:

```typescript
// app/[locale]/(landing)/layout.tsx
import { TranslationProvider } from '@/components/translation-provider';
import { landing } from '@/lib/messages';

export default async function LandingLayout({ children, params }: Props) {
  const { locale } = await params;
  return (
    <TranslationProvider locale={locale} messages={landing}>
      {children}
    </TranslationProvider>
  );
}
```

### Real-World Results

Results from a production app using this pattern:

| Page      | Before (keys) | After (keys) | Reduction |
| --------- | ------------- | ------------ | --------- |
| Landing   | 340           | 150          | 56%       |
| Pricing   | 340           | 75           | 78%       |
| Workspace | 340           | 145          | 57%       |
| Settings  | 340           | 175          | 49%       |

### Implementation Tips

1. **Keep `common.json` small** – only truly global strings (nav, footer, errors)
2. **Compose message sets** – use `mergeMessages()` to include common + page-specific
3. **Use route groups** – Next.js route groups let you scope providers without affecting URLs
4. **Combine with caching** – after the first translation, subsequent loads are instant

> **Note**: This optimization is most important for JIT translation. For pre-generated translations using the CLI `generate` command, file size has minimal impact since translation happens at build time.
