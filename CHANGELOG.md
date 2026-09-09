# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-09-09

### Added

- React-free core/server and individual framework entry points, with existing imports retained.
- Public custom provider/cache injection and safe programmatic CLI exports.
- Node/React compatibility CI, isolated npm tarball checks, dependency update automation, and release tag validation.
- Configurable batch size, character budget, concurrency, and automatic text batching delay.
- Shared progressive `translateBatchStream`, request cancellation, and idempotent translator shutdown.
- Bounded LRU memory cache, bulk cache operations, and Redis command timeouts.
- Explicit batch/page outcome metadata, a failure observer, and opt-in strict error handling while preserving source-content fallback by default.
- Browser request chunking and bounded AutoTranslate retries, with configurable limits and error reporting.
- Regression coverage for the core pipeline, React components, HTTP/SSE transport, framework adapters, and CLI.

### Fixed

- Unsupported provider/cache configuration now fails clearly instead of fabricating translations or silently switching storage.
- API keys are fully redacted in debug logs; redundant retries outside the OpenAI SDK are removed.
- Context-sensitive and configuration-scoped cache identities; old cache entries are left untouched in their previous namespace.
- Ukrainian, Nynorsk, regional/script locale normalization, source-locale bypass, and Arabic RTL handling.
- Browser language switching, immutable nested message updates, character-data observation, request cleanup, empty exclusion attributes, and incomplete/error response handling.
- Stream parsing targets the translation array; integrations validate full streams before caching and preserve progressive rendering.
- HTML whitespace preservation, Express binary and UTF-8 response handling, and Astro/Remix fallback bodies and response headers.
- next-intl adapters preserve message arrays, non-string values, and independent progressive snapshots.
- CLI language failures produce a nonzero exit status, retain successful outputs, and preserve existing files through atomic writes.

### Changed

- Refresh compatible dependencies and resolve all currently reported npm audit findings; enable React hook lint rules and remove unused direct lint dependencies.
- Publish with Node 24, provenance, and OIDC support while preserving the existing npm token fallback.
- Batch, streaming, Next/next-intl, and CLI translation share one cache and provider scheduler; overlapping requests reuse in-flight work.
- Next streaming responses follow downstream pulls and release work on disconnect; framework request/response cancellation reaches the provider without cancelling other interested callers.
- AutoTranslate scans only affected subtrees after DOM mutations, retaining full initial and language-change scans.
- CLI generation deduplicates context-aware strings and runs up to two bounded batches concurrently.

## [1.2.8] - 2026-09-09

### Changed

- Default reasoning effort to `none` for batch and streaming translation requests.
- Add configurable temperature, completion token budget, and reasoning effort.

### Fixed

- Request JSON output consistently for streaming and batch translations.
- Reject malformed or incomplete translation responses and unsuccessful finish reasons.

## [1.2.6] - 2024-12-18

### Fixed

- **Streaming JSON Parser**: Fixed critical bug in `OpenAIProvider.translateStream` where the incremental JSON parser did not clear `currentElement` after parsing the `"translations"` key, causing the first translation to be corrupted or skipped. This resulted in translations being shifted/swapped between elements.

## [1.2.5] - 2024-12-18

### Fixed

- **Streaming Index Mapping**: Fixed bug in `next-intl.ts` streaming functions where translations could be mapped to wrong elements when cache is partially populated. All three streaming methods (`streamMessages`, `getStreamingMessages`, `createStreamingPromise`) now correctly use the generator's index.

## [1.2.4] - 2024-12-18

### Fixed

- **Streaming Route Handler**: Fixed bug in `createNextStreamingRouteHandler` where translations could be mapped to wrong DOM elements. Now correctly uses the stream generator's index instead of a separate counter.

## [1.2.3] - 2024-12-18

### Fixed

- **Streaming Translation**: Fixed critical bug where `translateStream` buffered the entire OpenAI response before yielding translations. Now uses incremental JSON array parsing to yield each translation as it completes, enabling true progressive DOM updates.

## [1.2.0] - 2024-12-17

### Added

- **Translation Style/Register**: New optional `style` parameter (`formal`, `neutral`, `casual`, `marketing`, `technical`) to control translation tone without hardcoding idioms
- **User-provided Glossary**: Optional `glossary` field in config for preferred translations of specific phrases
- Improved locale clarifications for Norwegian (Bokmål vs Nynorsk), Chinese (Simplified vs Traditional), Portuguese (Brazilian vs European), English (US vs UK), and Spanish variants

### Changed

- **JSON Output Format**: Prompt now requests `{ "translations": [...] }` object envelope to match `json_object` response format, improving reliability
- **Streaming Parser**: Replaced fragile character-by-character JSON array parser with buffered approach that correctly handles the object envelope format
- **Temperature**: Lowered from 0.3 to 0.1 for more consistent, deterministic translations
- **Whitespace Rule**: Relaxed from "preserve all whitespace" to "preserve meaningful whitespace" to allow idiomatic punctuation in target language
- **HTML Safety Rules**: Enhanced to explicitly protect URLs, email addresses, backticks, and `<code>` blocks

### Fixed

- **Norwegian Nynorsk (`nn`)**: Fixed locale mapping bug where `nn` was incorrectly instructed to use Bokmål instead of Nynorsk

## [1.1.2] - Previous Release

- Initial stable release with core translation functionality
