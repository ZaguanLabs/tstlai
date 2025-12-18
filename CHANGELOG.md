# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
