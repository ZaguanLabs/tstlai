# Feature Request: Client-safe languages export for tstlai

## Summary

Add a `tstlai/languages` export path that provides language constants (`SHORT_CODE_DEFAULTS`, `SUPPORTED_LOCALE_CODES`, `isLanguageSupported`, etc.) without pulling in server-side dependencies like `ioredis`.

## Problem

When using `tstlai` with Next.js App Router and `next-intl`, the routing configuration needs access to `SHORT_CODE_DEFAULTS` to define supported locales:

```typescript
// src/i18n/routing.ts
import { defineRouting } from 'next-intl/routing';
import { SHORT_CODE_DEFAULTS } from 'tstlai'; // ❌ This pulls in ioredis!

export const routing = defineRouting({
  locales: Object.keys(SHORT_CODE_DEFAULTS),
  defaultLocale: 'en',
});
```

This file is imported by `next-intl/navigation` which is used in client components. The import chain becomes:

```
Client Component → navigation.ts → routing.ts → tstlai → ioredis → dns, fs, net, tls
```

This causes build failures:

```
Module not found: Can't resolve 'dns'
Module not found: Can't resolve 'fs'
Module not found: Can't resolve 'net'
Module not found: Can't resolve 'tls'
```

## Current Workaround

Hardcode the locale list:

```typescript
const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'de', ...] as const;
```

This works but duplicates data and can get out of sync with `tstlai` updates.

## Proposed Solution

Add a new export path in `package.json`:

```json
{
  "exports": {
    "./languages": {
      "types": "./dist/languages.d.ts",
      "default": "./dist/languages.js"
    }
  }
}
```

The `languages.js` file already exists and contains only pure JavaScript constants - no server dependencies. This would allow:

```typescript
import { SHORT_CODE_DEFAULTS, isLanguageSupported } from 'tstlai/languages';
```

## Benefits

1. **No breaking changes** - existing imports continue to work
2. **Client-safe** - can be used in browser bundles
3. **Tree-shakeable** - only imports what's needed
4. **Single source of truth** - no hardcoded locale lists in user code
5. **Minimal effort** - just needs a package.json exports entry

## Affected Use Cases

- Next.js App Router with `next-intl` routing
- Any client-side code needing locale validation
- Edge runtime deployments (Vercel Edge, Cloudflare Workers)
