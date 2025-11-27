# Configuration Reference

## Tstlai Options

The `Tstlai` constructor accepts a configuration object matching the `TranslationConfig` interface.

```typescript
interface TranslationConfig {
  targetLang: string;
  provider: AIProviderConfig;
  cache?: CacheConfig;
  excludedTerms?: string[];
  translationContext?: string;
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

| Field     | Type       | Description                                                           |
| --------- | ---------- | --------------------------------------------------------------------- |
| `type`    | `'openai'` | Currently only OpenAI is supported.                                   |
| `apiKey`  | `string`   | OpenAI API Key. Defaults to `OPENAI_API_KEY` env var.                 |
| `model`   | `string`   | Model ID (e.g. `gpt-3.5-turbo`, `gpt-4`). Defaults to `OPENAI_MODEL`. |
| `baseUrl` | `string`   | Custom API URL. Defaults to `OPENAI_BASE_URL`.                        |

### `cache`

**Type:** `CacheConfig`
**Required:** No (Defaults to Memory)

| Field              | Type                  | Description                              |
| ------------------ | --------------------- | ---------------------------------------- |
| `type`             | `'memory' \| 'redis'` | Cache backend.                           |
| `ttl`              | `number`              | Time-to-live in seconds.                 |
| `connectionString` | `string`              | Redis URL.                               |
| `keyPrefix`        | `string`              | Redis key namespace (default `tstlai:`). |

## Environment Variables

| Variable               | Description                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`       | OpenAI API Key                                                                           |
| `OPENAI_MODEL`         | Model ID (default: `gpt-3.5-turbo`)                                                      |
| `OPENAI_BASE_URL`      | API Base URL                                                                             |
| `REDIS_URL`            | Redis connection string                                                                  |
| `TSTLAI_EXCLUDED_TEXT` | Comma-separated list of terms to exclude from translation (e.g. `BrandName,AnotherTerm`) |
