export { Tstlai } from './core/Tstlai';
export type {
  TranslationConfig,
  ProcessedPage,
  AIProvider,
  AIProviderConfig,
  CacheConfig,
} from './types';
export * as integrations from './integrations';

// Language support
export {
  SUPPORTED_LANGUAGES,
  SUPPORTED_LOCALE_CODES,
  SHORT_CODE_DEFAULTS,
  TIER_1_LANGUAGES,
  TIER_2_LANGUAGES,
  TIER_3_LANGUAGES,
  isLanguageSupported,
  getLanguageInfo,
  getLanguageTier,
  getLanguagesByTier,
  normalizeLocaleCode,
} from './languages';
export type { SupportedLanguage, LanguageTier } from './languages';
