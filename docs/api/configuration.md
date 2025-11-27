# Configuration Reference

## Tstlai Options

The `Tstlai` constructor accepts a configuration object matching the `TranslationConfig` interface.

```typescript
interface TranslationConfig {
  targetLang: string;
  provider: AIProviderConfig;
  cache?: CacheConfig;
}
```

### `targetLang`
**Type:** `string`
**Required:** Yes
The ISO language code to translate to (e.g., `es`, `fr_FR`). Used for:
- Selecting the translation context.
- Setting the `lang` attribute on HTML.
- Determining Text Direction (RTL/LTR).

### `provider`
**Type:** `AIProviderConfig`
**Required:** Yes

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'openai'` | Currently only OpenAI is supported. |
| `apiKey` | `string` | OpenAI API Key. Defaults to `OPENAI_API_KEY` env var. |
| `model` | `string` | Model ID (e.g. `gpt-3.5-turbo`, `gpt-4`). Defaults to `OPENAI_MODEL`. |
| `baseUrl`| `string` | Custom API URL. Defaults to `OPENAI_BASE_URL`. |

### `cache`
**Type:** `CacheConfig`
**Required:** No (Defaults to Memory)

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'memory' \| 'redis'` | Cache backend. |
| `ttl` | `number` | Time-to-live in seconds. |
| `connectionString` | `string` | Redis URL. |
| `keyPrefix` | `string` | Redis key namespace (default `tstlai:`). |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API Key |
| `OPENAI_MODEL` | Model ID (default: `gpt-3.5-turbo`) |
| `OPENAI_BASE_URL`| API Base URL |
| `REDIS_URL` | Redis connection string |
