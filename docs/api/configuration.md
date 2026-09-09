# Configuration Reference

## Tstlai Options

The `Tstlai` constructor accepts a configuration object matching the `TranslationConfig` interface.

```typescript
interface TranslationConfig {
  targetLang: string;
  provider: AIProviderConfig | AIProvider;
  cache?: CacheConfig | TranslationCache;
  batching?: BatchingConfig;
  excludedTerms?: string[];
  translationContext?: string;
  errorMode?: 'fallback' | 'throw';
  onError?: (error: Error) => void;
}
```

### `targetLang`

**Type:** `string`
**Required:** Yes
The ISO language code to translate to (e.g., `es`, `fr_FR`). Used for:

- Selecting the translation context.
- Setting the `lang` attribute on HTML.
- Determining Text Direction (RTL/LTR).

### `translationContext`

**Type:** `string`
**Required:** No
A description of the content's context to guide the AI's tone and vocabulary choice.

Example: `"Marketing website for a B2B SaaS product, professional but approachable tone."`

### `excludedTerms`

**Type:** `string[]`
**Required:** No
An array of words or phrases that should **not** be translated (e.g., brand names, technical terms). These are passed to the AI model as a strict instruction.

Example: `['tstlai', 'Content Refinery', 'Next.js']`

Can also be set via the `TSTLAI_EXCLUDED_TEXT` environment variable (comma-separated).

### `provider`

**Type:** `AIProviderConfig`
**Required:** Yes

| Field                 | Type                                                            | Description                                                                                                            |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `type`                | `'openai'`                                                      | OpenAI-compatible API, including Zaguán AI.                                                                            |
| `apiKey`              | `string`                                                        | API key. Defaults to `OPENAI_API_KEY` env var.                                                                         |
| `model`               | `string`                                                        | Exact gateway model ID. Defaults to `OPENAI_MODEL`, then `gpt-5.2-mini`.                                               |
| `baseUrl`             | `string`                                                        | Custom API URL. Defaults to `OPENAI_BASE_URL`.                                                                         |
| `timeout`             | `number`                                                        | Request timeout in milliseconds (default: `120000`).                                                                   |
| `temperature`         | `number \| null`                                                | Default: `0.1`. Set `null` to omit the parameter and use the model's default.                                          |
| `maxCompletionTokens` | `number`                                                        | Optional positive output budget, including reasoning tokens. Sent as `max_completion_tokens`; omitted by default.      |
| `reasoningEffort`     | `'none' \| 'minimal' \| 'low' \| 'medium' \| 'high' \| 'xhigh'` | Sent as `reasoning_effort`. Default: `'none'` for translation speed. Supported values depend on the model and gateway. |

Both batch and streaming requests send `response_format: { type: 'json_object' }`
and use the same generation settings. For example:

```typescript
const translator = new Tstlai({
  targetLang: 'nb',
  provider: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: 'google/gemini-3.8-flash',
    reasoningEffort: 'none', // Default; can be overridden for other models
  },
});
```

The model ID is forwarded unchanged. A gateway error such as
`No provider found for model` means the gateway could not route that model;
verify its registered model ID and provider mapping. Adding tools or generation
parameters cannot repair a missing route. tstlai does not send `max_tokens`;
a gateway log showing `max_tokens: 0` may reflect its default for an omitted field.

The provider rejects malformed responses, translation count mismatches and
unsuccessful finish reasons instead of treating them as complete. Streaming
translations already yielded before an error may have been displayed. Built-in
streaming integrations persist new cache entries only after the full response
has passed validation.

Legacy root arrays still stream progressively. Legacy objects with a differently
named array remain supported, but are validated in full before their strings are
emitted, so unrelated metadata cannot be mistaken for translations.

### Custom providers and caches

Pass an `AIProvider` implementation directly to use another SDK or backend:

```typescript
import { Tstlai, type AIProvider, type TranslationCache } from 'tstlai/core';

const provider: AIProvider = {
  async translate(texts, targetLang, excludedTerms, context, glossary, style, options) {
    // Your implementation must return one string per input and honor options?.signal.
    return myTranslationBackend(texts, targetLang, { signal: options?.signal });
  },
  getModelInfo() {
    return { name: 'my-backend/model/config-v1', capabilities: ['translation'] };
  },
};
const translator = new Tstlai({ targetLang: 'nb', provider });
```

Use a stable, distinct `getModelInfo().name` for each custom backend/model/settings
combination that can produce different results; it participates in cache identity.
Providers can also implement `translateStream` and `supportsStreaming`.

A custom `TranslationCache` instance can similarly be passed as `cache`; it must
implement `get` and `set`, and may implement `getMany`, `setMany`, and `disconnect`.
`translator.close()` calls the supplied cache's `disconnect` method. If several
translators share an externally managed cache, coordinate its shutdown or omit
`disconnect` from the passed wrapper.

**Configuration correction:** `{ type: 'custom' }`, `{ type: 'google' }`, and
`{ type: 'anthropic' }` previously returned fabricated `[MOCK ...]` strings; they
now fail immediately. Pass an actual provider implementation, or use
`{ type: 'openai', baseUrl, model }` for an OpenAI-compatible gateway such as
Zaguán AI. Similarly, `{ type: 'sql' }` now rejects instead of silently selecting
memory storage; pass your SQL-backed cache implementation directly.

The OpenAI-compatible provider uses the SDK's retry policy without an extra
application-level retry for arbitrary `TypeError`s. Debug logs report whether an
API key is configured without revealing any part of it.

### Failure handling

`errorMode` defaults to `'fallback'`: batch and HTML processing keep source content
when translation fails. `translateBatch()` now also returns `status` (`'complete'`,
`'partial'`, or `'fallback'`), `failedCount`, and an optional `error`. `process()`
includes `status` and `failedCount`; a complete translation failure uses the source
language and direction for the returned HTML.

Set `errorMode: 'throw'` to reject failed batch, text, and HTML operations. Use
`onError` to observe failures while retaining fallback behavior. Exceptions from
this observer are logged and do not interrupt fallback.

The batch route retains its `translations` array and HTTP 200 fallback behavior,
adding `status`, a generic `error`, and `failedIndices` when translation fails.
Strict-mode route failures return HTTP 500. Streaming routes send an error event
instead of `[DONE]` on failure. Browser consumers check these events and HTTP
status codes; a failed or incomplete response is never reported as successful.

### Browser request limits and retries

`AutoTranslate` and `TstlaiStreamingProvider` split requests by `maxTexts` (default
`100`) and `maxTotalChars` (default `100000`). Set these props to match any stricter
limits on your route. A single text above the character limit fails explicitly;
it is not split into independently translated fragments.

`AutoTranslate` accepts `maxRetries` (default `2`, in addition to the initial
attempt) and `onError`. It retries unsuccessful requests with bounded backoff,
keeps original text for language changes, and observes edits to existing text
nodes. Both browser integrations abort obsolete requests on language changes
and unmount. Next route handlers forward cancellation upstream when no remaining
caller needs that work. Gateway billing and whether generation stops after an HTTP
disconnect depend on the gateway. Custom providers should honor the optional signal.

After the initial scan, `AutoTranslate` visits changed or newly added subtrees only.
Language changes still scan the whole page to restore and translate source content.

### Locale identity

Short codes resolve to their default locale, and region/script variants remain
distinct. `uk` means Ukrainian, `nn` means Nynorsk, `en-gb` resolves to `en_GB`, and
`zh-Hant` resolves to `zh_TW`. Use `gb` or `en_GB` for British English. Source-language
bypass compares normalized locales: `en` and `en-US` match; `en-US` and `en-GB` do not.

### `cache`

**Type:** `CacheConfig`
**Required:** No (Defaults to Memory)

| Field              | Type                  | Description                                                    |
| ------------------ | --------------------- | -------------------------------------------------------------- |
| `type`             | `'memory' \| 'redis'` | Cache backend.                                                 |
| `ttl`              | `number`              | Time-to-live in seconds (default `3600`); `0` disables expiry. |
| `connectionString` | `string`              | Redis URL.                                                     |
| `keyPrefix`        | `string`              | Redis key namespace (default `tstlai:`).                       |

### Batching and shared work

The core pipeline serves `translateText`, `translateBatch`, `translateBatchStream`,
HTML processing, Next routes, next-intl adapters, and CLI generation. Reuse a
translator instance to share in-flight work across callers. Sharing is scoped to
that instance; Redis shares completed translations across processes.

```typescript
batching: {
  maxTexts: 100,       // Unique strings per provider request
  maxTotalChars: 100000,
  concurrency: 2,     // Provider calls; cache lookups have a separate queue with the same limit
  delayMs: 50,        // Collection window for translateText only
}
```

These are the defaults. Limits must be positive integers, except `delayMs`, which
may be zero. A single text exceeding the core character budget is sent alone,
without splitting its meaning. HTTP route limits remain strict and separate.
Provider requests may complete out of order; output indices and batch mappings
still correspond to the original inputs. Duplicate strings share work, including
across overlapping calls and equivalent locale spellings.

Streaming callers receive progressive results where the provider supports them.
When joining an already-running batch request, they receive results when that
batch completes. Batch callers joining a stream wait for full validation.
Cache lookups run separately, so cache hits do not wait for a free provider slot.
Each provider batch is validated before its translations are cached. If one batch
fails, completed batches remain available; fallback mode reports a partial result.

### Cancellation and cleanup

Pass `TranslationRequestOptions` as the last argument:

```typescript
const controller = new AbortController();
await translator.translateText('Hello', 'nb', undefined, { signal: controller.signal });
await translator.translateBatch(items, 'nb', { signal: controller.signal });
await translator.process(html, { signal: controller.signal });

for await (const { index, translation, cached } of translator.translateBatchStream(items, 'nb', {
  signal: controller.signal,
})) {
  // index refers to the original items array, including duplicate strings.
}

// At application shutdown, or after a short-lived script finishes:
await translator.close();
```

`items` contains `{ text, hash }` entries, as for `translateBatch`. Hashes must
identify the trimmed source text including any context hints.
`translateBatchStream` always rejects on failure; receiving the last string does
not establish success until iteration completes. Use `{ stream: false }` to request
batch-provider progress for new work. An existing shared request retains its mode.

Cancellation rejects with `AbortError`, including in fallback mode. Cancelling one
caller releases only its interest. The upstream operation is aborted when its
batch has no remaining callers. Next routes, Astro/Remix request signals, and
Express/Fastify response disconnects propagate cancellation automatically.
next-intl methods accept request options after the locale.

`close()` cancels queued and active work, clears the automatic text-batching timer,
and releases cache resources. It is idempotent; new translations reject after
closing. Keep shared server instances open across requests. Custom providers must
honor the optional seventh `translate`/`translateStream` argument's `signal` to
stop their own I/O. The core can release callers even if a custom provider ignores it.

Memory cache also accepts `maxEntries` (default `10000`), and Redis accepts
`commandTimeout` in milliseconds (default `1000`). See [caching](../guides/caching.md)
for eviction and timeout behavior.

## Environment Variables

| Variable               | Description                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`       | OpenAI API Key                                                                           |
| `OPENAI_MODEL`         | Model ID (default: `gpt-5.2-mini`)                                                       |
| `OPENAI_BASE_URL`      | API Base URL                                                                             |
| `REDIS_URL`            | Redis connection string                                                                  |
| `TSTLAI_EXCLUDED_TEXT` | Comma-separated list of terms to exclude from translation (e.g. `BrandName,AnotherTerm`) |

## Contextual Translation

### API Usage

The `translateText` method accepts an optional context parameter for disambiguation:

```typescript
// Without context - AI guesses meaning
await tstlai.translateText('Save');

// With context - AI knows it's a button action
await tstlai.translateText('Save', 'es_ES', 'button: save file to disk');

// More examples
await tstlai.translateText('Post', undefined, 'verb: publish content');
await tstlai.translateText('Match', 'de_DE', 'noun: sports game');
```

### JSON Format (CLI)

For the CLI `generate` command, use the `$t` / `$ctx` format:

```json
{
  "actions": {
    "save": { "$t": "Save", "$ctx": "button: save file to disk" },
    "post": { "$t": "Post", "$ctx": "verb: publish content" },
    "file": { "$t": "File", "$ctx": "noun: menu item" }
  },
  "labels": {
    "title": "Welcome"
  }
}
```

- `$t` - The text to translate
- `$ctx` - Context hint (used by AI, stripped from output)

Plain strings (like `"title": "Welcome"`) work as before.

### Best Practices

1. **Be specific** - "verb: publish content" beats just "verb"
2. **Include UI context** - "button", "menu item", "page title", "error message"
3. **Mention domain** - "sports", "finance", "medical" when relevant
4. **Only when needed** - Don't add context to unambiguous phrases like "Welcome to our app"

## RTL (Right-to-Left) Support

tstlai automatically detects RTL languages and provides helpers for setting text direction.

### Supported RTL Languages

- Arabic (`ar`)
- Hebrew (`he`)
- Persian/Farsi (`fa`)
- Urdu (`ur`)
- Pashto (`ps`)
- Sindhi (`sd`)
- Uyghur (`ug`)

### Instance Methods

#### `isRtl(targetLangOverride?: string): boolean`

Check if the target language uses right-to-left text direction.

```typescript
tstlai.isRtl(); // Check configured targetLang
tstlai.isRtl('ar_SA'); // Check specific language
```

#### `getDir(targetLangOverride?: string): 'ltr' | 'rtl'`

Get the text direction for the target language.

```typescript
document.documentElement.dir = tstlai.getDir();
```

### ProcessedPage Response

When using `process()`, the response includes `dir` and `lang`:

```typescript
interface ProcessedPage {
  html: string;
  translatedCount: number;
  cachedCount: number;
  dir: 'ltr' | 'rtl'; // Text direction
  lang: string; // Target language code
}
```

Example:

```typescript
const result = await tstlai.process(html);
console.log(result.dir); // 'rtl' for Arabic
console.log(result.lang); // 'ar_SA'
```

### Code Blocks in RTL Pages

Code should always remain left-to-right, even on RTL pages. Add this CSS:

```css
pre,
code {
  direction: ltr;
  text-align: left;
}
```
