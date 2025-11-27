# IDEAI Context File

## Project Overview

This directory contains the "tstlai" project, a TypeScript-based **AI Translation Engine**. The project provides a middleware-style library for translating web pages on the fly using AI providers.

### Key Information

- **Project Name**: tstlai
- **Primary Language**: TypeScript
- **Purpose**: A Just-In-Time (JIT) Web Localization Engine that parses HTML, translates text content via AI, and caches results.
- **License**: MIT License

### Project Structure

```
/home/stig/dev/ai/zaguan/labs/tstlai/
├── src/
│   ├── index.ts (Main entry point)
│   ├── core/
│   │   ├── Tstlai.ts (Main Translation Engine Orchestrator)
│   │   ├── HTMLProcessor.ts (DOM Parsing & Text Extraction)
│   │   └── Cache.ts (Translation Memory/Caching)
│   ├── types/
│   │   └── index.ts (Translation & Provider Types)
│   └── providers/
│       ├── BaseAIProvider.ts
│       └── OpenAIProvider.ts
```

## Core Components

### Main Tstlai Class
The core `Tstlai` class orchestrates the translation lifecycle:
1.  **Parse**: Uses `HTMLProcessor` to break HTML into text nodes.
2.  **Cache Check**: Queries `TranslationCache` for existing translations (by hash).
3.  **Translate**: Sends only missing text segments to the AI Provider.
4.  **Reconstruct**: Re-assembles the HTML with translated text.

### HTMLProcessor
- Uses `node-html-parser` to walk the DOM.
- Extracts text nodes while respecting `ignored` tags (script, style) and `data-no-translate` attributes.
- Handles text hashing for cache keys.

### Caching
- `TranslationCache` interface supports pluggable backends (Memory, Redis, SQL).
- MVP includes `InMemoryCache`.

## Usage

```typescript
import { Tstlai } from 'tstlai';

const translator = new Tstlai({
  targetLang: 'es',
  provider: { type: 'openai', apiKey: '...' },
  cache: { type: 'memory' }
});

const result = await translator.process('<h1>Hello</h1>');
console.log(result.html); // <h1>Hola</h1>
```