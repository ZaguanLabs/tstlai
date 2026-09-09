export { Tstlai } from './Tstlai';
export type {
  TranslationConfig,
  ProcessedPage,
  AIProvider,
  AIProviderConfig,
  CacheConfig,
  TranslationBatchResult,
  BatchingConfig,
  TranslationRequestOptions,
  TranslationStreamResult,
  TranslationCache,
} from '../types';
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
} from '../languages';
export type { SupportedLanguage, LanguageTier } from '../languages';
