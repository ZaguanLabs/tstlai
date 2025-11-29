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
