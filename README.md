# tstlai: Just-In-Time Web Localization Engine

**tstlai** (TypeScript Translation AI) is a middleware-ready library that automatically translates your web application's HTML content on the fly using AI.

Unlike traditional i18n libraries that require maintaining massive JSON files, `tstlai` intercepts your HTML, extracts the text, and uses AI to provide context-aware translations, all while caching the results for production-grade performance.

## 🚀 Features

- **Just-In-Time Translation**: No manual translation files. Content is translated as it is rendered.
- **HTML-Safe**: Intelligent parsing ensures your HTML structure, classes, and attributes remain untouched. Only text content is translated.
- **Smart Caching**: Uses SHA-256 content hashing to cache translations. Once a sentence is translated, it's served instantly from memory (or Redis/SQL in future updates).
- **AI-Powered**: Pluggable AI providers (currently OpenAI) allow for high-quality, context-aware translations.
- **RTL Support**: Automatically detects Right-to-Left languages (like Arabic, Hebrew) and sets the `dir="rtl"` attribute on your HTML.
- **Selective Translation**: Respects `data-no-translate` attributes and ignores `<script>`, `<style>`, and `<code>` tags automatically.

## 📦 Installation

```bash
npm install tstlai
```

## ⚡ Quick Start

Here is how to initialize the engine and translate a snippet of HTML.

```typescript
import { Tstlai } from 'tstlai';

async function main() {
  // 1. Initialize the Engine
  const translator = new Tstlai({
    targetLang: 'es', // Target language code
    provider: {
      type: 'openai',
      // apiKey, model, and baseUrl can be omitted if set via env vars:
      // OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL
    },
    cache: {
      type: 'memory',
      ttl: 3600 // Cache duration in seconds
    }
  });

  // 2. Your raw HTML content
  const rawHtml = `
    <article>
      <h1>Welcome to the Future</h1>
      <p>Translate your website instantly.</p>
      <button data-no-translate>tstlai v1.0</button>
    </article>
  `;

  // 3. Process the HTML
  const result = await translator.process(rawHtml);

  console.log(result.html);
}

main();
```

### Output
```html
<article>
  <h1>Bienvenido al Futuro</h1>
  <p>Traduce tu sitio web al instante.</p>
  <button data-no-translate>tstlai v1.0</button>
</article>
```

## 🛠️ How It Works

1.  **Parse**: The engine parses the incoming HTML and extracts text nodes. It automatically ignores non-content tags.
2.  **Hash & Check**: Each text segment is hashed. The system checks the cache for existing translations to save costs and reduce latency.
3.  **Translate**: Cache misses are batched and sent to the AI provider in a single request.
4.  **Reconstruct**: The translated text is injected back into the DOM, preserving the original layout perfectly.

## ⚙️ Configuration

The `Tstlai` constructor accepts a configuration object:

| Option | Type | Description |
|--------|------|-------------|
| `targetLang` | `string` | The ISO language code to translate to (e.g., 'es', 'fr', 'jp'). |
| `provider` | `object` | Configuration for the AI provider (API key, model, etc.). |
| `cache` | `object` | Cache strategy configuration. Supports `memory` (default) and `redis`. |

### Redis Caching

To use Redis, provide the `connectionString` or set `REDIS_URL` env var.

```typescript
const translator = new Tstlai({
  // ...
  cache: {
    type: 'redis',
    connectionString: 'redis://localhost:6379', // or 'redis+socket:///tmp/redis.sock'
    ttl: 86400 // 24 hours
  }
});
```

### Environment Variables

You can configure the OpenAI provider using standard environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | Your OpenAI API Key | `undefined` |
| `OPENAI_MODEL` | The model to use | `gpt-3.5-turbo` |
| `OPENAI_BASE_URL` | Custom API endpoint | `https://api.openai.com/v1` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |


## � Framework Integration

### Express / Node.js Middleware

To automatically translate all HTML responses in an Express app:

```typescript
import express from 'express';
import { Tstlai, integrations } from 'tstlai';

const app = express();
const translator = new Tstlai({ targetLang: 'es', provider: { type: 'openai' } });

// Apply middleware
app.use(integrations.createExpressMiddleware(translator));

app.get('/', (req, res) => {
  res.send('<h1>Hello World</h1>'); // Automatically translated to <h1>Hola Mundo</h1>
});
```

## �🛡️ Preventing Translation

To prevent specific elements from being translated, add the `data-no-translate` attribute to any HTML tag:

```html
<span data-no-translate>BrandName™</span>
```

## License

MIT
