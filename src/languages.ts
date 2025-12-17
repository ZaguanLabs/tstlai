/**
 * Supported languages for AI translation.
 * Categorized by proficiency tier based on modern LLM capabilities.
 */

export type LanguageTier = 'high' | 'good' | 'functional';

export interface SupportedLanguage {
  /** Locale code (e.g., 'en_US', 'es_ES') */
  code: string;
  /** Language name */
  language: string;
  /** Country or region */
  region: string;
  /** Proficiency tier */
  tier: LanguageTier;
  /** Notes on translation quality */
  notes: string;
}

/**
 * Tier 1 (High): Excellent translations - nuanced, accurate, context-aware
 */
export const TIER_1_LANGUAGES: SupportedLanguage[] = [
  {
    code: 'en_US',
    language: 'English',
    region: 'United States',
    tier: 'high',
    notes: 'Excellent. Translations are nuanced, accurate, and preserve context and tone.',
  },
  {
    code: 'en_GB',
    language: 'English',
    region: 'United Kingdom',
    tier: 'high',
    notes: 'Excellent. Fully aware of British spelling and common idioms.',
  },
  {
    code: 'de_DE',
    language: 'German',
    region: 'Germany',
    tier: 'high',
    notes: 'Excellent. Highly accurate and natural-sounding translations.',
  },
  {
    code: 'es_ES',
    language: 'Spanish',
    region: 'Spain',
    tier: 'high',
    notes: 'Excellent. Aware of Castilian vocabulary and norms.',
  },
  {
    code: 'es_MX',
    language: 'Spanish',
    region: 'Mexico',
    tier: 'high',
    notes: 'Excellent. The primary standard for Latin American Spanish.',
  },
  {
    code: 'fr_FR',
    language: 'French',
    region: 'France',
    tier: 'high',
    notes: 'Excellent. Consistently high-quality translation.',
  },
  {
    code: 'it_IT',
    language: 'Italian',
    region: 'Italy',
    tier: 'high',
    notes: 'Excellent. Reliable for all types of translation tasks.',
  },
  {
    code: 'ja_JP',
    language: 'Japanese',
    region: 'Japan',
    tier: 'high',
    notes: 'Excellent. Strong grasp of grammar, script, and cultural context.',
  },
  {
    code: 'pt_BR',
    language: 'Portuguese',
    region: 'Brazil',
    tier: 'high',
    notes: 'Excellent. The most common and well-supported variant of Portuguese.',
  },
  {
    code: 'pt_PT',
    language: 'Portuguese',
    region: 'Portugal',
    tier: 'high',
    notes: 'Excellent. Fully proficient in European Portuguese.',
  },
  {
    code: 'zh_CN',
    language: 'Chinese',
    region: 'China (Simplified)',
    tier: 'high',
    notes: 'Excellent. Expert-level translation for Simplified Chinese.',
  },
  {
    code: 'zh_TW',
    language: 'Chinese',
    region: 'Taiwan (Traditional)',
    tier: 'high',
    notes: 'Excellent. Expert-level translation for Traditional Chinese.',
  },
];

/**
 * Tier 2 (Good): Reliable translations - suitable for professional use
 */
export const TIER_2_LANGUAGES: SupportedLanguage[] = [
  {
    code: 'ar_SA',
    language: 'Arabic',
    region: 'Saudi Arabia',
    tier: 'good',
    notes: 'Good and Reliable. Works well for Modern Standard Arabic (MSA).',
  },
  {
    code: 'bn_BD',
    language: 'Bengali',
    region: 'Bangladesh',
    tier: 'good',
    notes: 'Good and Reliable. Suitable for most professional and personal use.',
  },
  {
    code: 'cs_CZ',
    language: 'Czech',
    region: 'Czech Republic',
    tier: 'good',
    notes: 'Good and Reliable. Consistent performance for most content.',
  },
  {
    code: 'da_DK',
    language: 'Danish',
    region: 'Denmark',
    tier: 'good',
    notes: 'Good and Reliable. Solid choice for general-purpose translation.',
  },
  {
    code: 'el_GR',
    language: 'Greek',
    region: 'Greece',
    tier: 'good',
    notes: 'Good and Reliable. Strong performance in modern Greek.',
  },
  {
    code: 'fi_FI',
    language: 'Finnish',
    region: 'Finland',
    tier: 'good',
    notes: 'Good and Reliable. Handles complex grammar well for most cases.',
  },
  {
    code: 'he_IL',
    language: 'Hebrew',
    region: 'Israel',
    tier: 'good',
    notes: 'Good and Reliable. Consistent and accurate translations.',
  },
  {
    code: 'hi_IN',
    language: 'Hindi',
    region: 'India',
    tier: 'good',
    notes: 'Good and Reliable. Understands Devanagari script and common usage.',
  },
  {
    code: 'hu_HU',
    language: 'Hungarian',
    region: 'Hungary',
    tier: 'good',
    notes: 'Good and Reliable. Suitable for a wide range of translation needs.',
  },
  {
    code: 'id_ID',
    language: 'Indonesian',
    region: 'Indonesia',
    tier: 'good',
    notes: 'Good and Reliable. Very functional and widely applicable.',
  },
  {
    code: 'ko_KR',
    language: 'Korean',
    region: 'South Korea',
    tier: 'good',
    notes: 'Good and Reliable. Strong understanding of Hangul and modern usage.',
  },
  {
    code: 'nl_NL',
    language: 'Dutch',
    region: 'Netherlands',
    tier: 'good',
    notes: 'Good and Reliable. High-quality translations for general content.',
  },
  {
    code: 'nb_NO',
    language: 'Norwegian',
    region: 'Norway',
    tier: 'good',
    notes: 'Good and Reliable. Strong support for the Bokmål standard.',
  },
  {
    code: 'pl_PL',
    language: 'Polish',
    region: 'Poland',
    tier: 'good',
    notes: 'Good and Reliable. A solid choice for professional use cases.',
  },
  {
    code: 'ro_RO',
    language: 'Romanian',
    region: 'Romania',
    tier: 'good',
    notes: 'Good and Reliable. Consistent performance.',
  },
  {
    code: 'ru_RU',
    language: 'Russian',
    region: 'Russia',
    tier: 'good',
    notes: 'Good and Reliable. High accuracy for a wide variety of texts.',
  },
  {
    code: 'sv_SE',
    language: 'Swedish',
    region: 'Sweden',
    tier: 'good',
    notes: 'Good and Reliable. Solid performance for general-purpose translation.',
  },
  {
    code: 'th_TH',
    language: 'Thai',
    region: 'Thailand',
    tier: 'good',
    notes: 'Good and Reliable. Handles Thai script and nuances effectively.',
  },
  {
    code: 'tr_TR',
    language: 'Turkish',
    region: 'Turkey',
    tier: 'good',
    notes: 'Good and Reliable. Strong performance for most translation tasks.',
  },
  {
    code: 'uk_UA',
    language: 'Ukrainian',
    region: 'Ukraine',
    tier: 'good',
    notes: 'Good and Reliable. Quality is high and consistently improving.',
  },
  {
    code: 'vi_VN',
    language: 'Vietnamese',
    region: 'Vietnam',
    tier: 'good',
    notes: 'Good and Reliable. Suitable for a wide variety of contexts.',
  },
];

/**
 * Tier 3 (Functional): Basic translations - best for simple texts, review recommended
 */
export const TIER_3_LANGUAGES: SupportedLanguage[] = [
  {
    code: 'bg_BG',
    language: 'Bulgarian',
    region: 'Bulgaria',
    tier: 'functional',
    notes: 'Functional. Best for understanding the gist or for basic communication.',
  },
  {
    code: 'ca_ES',
    language: 'Catalan',
    region: 'Spain',
    tier: 'functional',
    notes: 'Functional. Works well, especially when translating to/from Spanish.',
  },
  {
    code: 'fa_IR',
    language: 'Persian',
    region: 'Iran',
    tier: 'functional',
    notes: 'Functional. Reliable for standard Farsi text; review is recommended.',
  },
  {
    code: 'hr_HR',
    language: 'Croatian',
    region: 'Croatia',
    tier: 'functional',
    notes: 'Functional. Good for general understanding; may lack natural flow.',
  },
  {
    code: 'lt_LT',
    language: 'Lithuanian',
    region: 'Lithuania',
    tier: 'functional',
    notes: 'Functional. Can produce literal translations; best for simple texts.',
  },
  {
    code: 'lv_LV',
    language: 'Latvian',
    region: 'Latvia',
    tier: 'functional',
    notes: 'Functional. Similar to Lithuanian; best to review for important use.',
  },
  {
    code: 'ms_MY',
    language: 'Malay',
    region: 'Malaysia',
    tier: 'functional',
    notes: 'Functional. Suitable for standard requests and getting the main idea.',
  },
  {
    code: 'sk_SK',
    language: 'Slovak',
    region: 'Slovakia',
    tier: 'functional',
    notes: 'Functional. Good for straightforward text; review complex content.',
  },
  {
    code: 'sl_SI',
    language: 'Slovenian',
    region: 'Slovenia',
    tier: 'functional',
    notes: 'Functional. Best for simple sentences and direct translations.',
  },
  {
    code: 'sr_RS',
    language: 'Serbian',
    region: 'Serbia',
    tier: 'functional',
    notes: 'Functional. Understands Cyrillic/Latin scripts; best for simple text.',
  },
  {
    code: 'sw_KE',
    language: 'Swahili',
    region: 'Kenya',
    tier: 'functional',
    notes: 'Functional. Primarily useful for basic translation and simple questions.',
  },
  {
    code: 'tl_PH',
    language: 'Tagalog',
    region: 'Philippines',
    tier: 'functional',
    notes: 'Functional. Also fil_PH. Good for gist; may sound machine-like.',
  },
  {
    code: 'ur_PK',
    language: 'Urdu',
    region: 'Pakistan',
    tier: 'functional',
    notes: 'Functional. Capable of translating standard text; review recommended.',
  },
];

/**
 * All supported languages across all tiers
 */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  ...TIER_1_LANGUAGES,
  ...TIER_2_LANGUAGES,
  ...TIER_3_LANGUAGES,
];

/**
 * Set of all supported locale codes for quick lookup
 */
export const SUPPORTED_LOCALE_CODES = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));

/**
 * Map of short language codes to their default full locale codes.
 * Used to resolve 'en' -> 'en_US', 'es' -> 'es_ES', etc.
 */
export const SHORT_CODE_DEFAULTS: Record<string, string> = {
  // Tier 1 Languages
  en: 'en_US',
  gb: 'en_GB', // Great Britain -> British English
  uk: 'en_GB', // UK (country code) -> British English (note: 'uk' also used for Ukrainian below)
  de: 'de_DE',
  es: 'es_ES',
  mx: 'es_MX', // Mexico -> Mexican Spanish
  fr: 'fr_FR',
  it: 'it_IT',
  ja: 'ja_JP',
  jp: 'ja_JP', // Japan (country code) -> Japanese
  pt: 'pt_BR',
  br: 'pt_BR', // Brazil (country code) -> Brazilian Portuguese
  zh: 'zh_CN',
  cn: 'zh_CN', // China (country code) -> Simplified Chinese
  tw: 'zh_TW', // Taiwan -> Traditional Chinese
  hk: 'zh_TW', // Hong Kong -> Traditional Chinese

  // Tier 2 Languages
  ar: 'ar_SA',
  sa: 'ar_SA', // Saudi Arabia (country code) -> Arabic
  bn: 'bn_BD',
  bd: 'bn_BD', // Bangladesh (country code) -> Bengali
  cs: 'cs_CZ',
  cz: 'cs_CZ', // Czech Republic (country code) -> Czech
  da: 'da_DK',
  dk: 'da_DK', // Denmark (country code) -> Danish
  el: 'el_GR',
  gr: 'el_GR', // Greece (country code) -> Greek
  fi: 'fi_FI',
  he: 'he_IL',
  il: 'he_IL', // Israel (country code) -> Hebrew
  iw: 'he_IL', // Legacy Hebrew code -> Hebrew
  hi: 'hi_IN',
  in: 'hi_IN', // India (country code) -> Hindi
  hu: 'hu_HU',
  id: 'id_ID',
  ko: 'ko_KR',
  kr: 'ko_KR', // South Korea (country code) -> Korean
  nl: 'nl_NL',
  nb: 'nb_NO',
  no: 'nb_NO', // Norwegian -> Bokmål
  nn: 'nb_NO', // Nynorsk -> Bokmål (closest supported)
  pl: 'pl_PL',
  ro: 'ro_RO',
  ru: 'ru_RU',
  sv: 'sv_SE',
  se: 'sv_SE', // Sweden (country code) -> Swedish
  th: 'th_TH',
  tr: 'tr_TR',
  ua: 'uk_UA', // Ukraine (country code) -> Ukrainian
  vi: 'vi_VN',
  vn: 'vi_VN', // Vietnam (country code) -> Vietnamese

  // Tier 3 Languages
  bg: 'bg_BG',
  ca: 'ca_ES',
  fa: 'fa_IR',
  ir: 'fa_IR', // Iran (country code) -> Persian
  hr: 'hr_HR',
  lt: 'lt_LT',
  lv: 'lv_LV',
  ms: 'ms_MY',
  my: 'ms_MY', // Malaysia (country code) -> Malay
  sk: 'sk_SK',
  sl: 'sl_SI',
  si: 'sl_SI', // Slovenia (country code) -> Slovenian
  sr: 'sr_RS',
  rs: 'sr_RS', // Serbia (country code) -> Serbian
  sw: 'sw_KE',
  ke: 'sw_KE', // Kenya (country code) -> Swahili
  tl: 'tl_PH',
  fil: 'tl_PH', // Filipino -> Tagalog
  ph: 'tl_PH', // Philippines (country code) -> Tagalog
  ur: 'ur_PK',
  pk: 'ur_PK', // Pakistan (country code) -> Urdu
};

/**
 * Normalize a locale code to the standard format (e.g., 'en-US' -> 'en_US')
 * and resolve short codes to their defaults (e.g., 'en' -> 'en_US')
 * @param code - Locale code in any format
 * @returns Normalized locale code
 */
export function normalizeLocaleCode(code: string): string {
  // Convert hyphens to underscores
  const normalized = code.replace('-', '_');

  // If it's already a full locale code, return it
  if (SUPPORTED_LOCALE_CODES.has(normalized)) {
    return normalized;
  }

  // Try to resolve short code
  const shortCode = normalized.split('_')[0].toLowerCase();
  return SHORT_CODE_DEFAULTS[shortCode] || normalized;
}

/**
 * Check if a locale code is supported
 * @param code - Locale code (e.g., 'en_US', 'es-ES', 'fr')
 * @returns true if supported
 */
export function isLanguageSupported(code: string): boolean {
  const normalized = normalizeLocaleCode(code);
  return SUPPORTED_LOCALE_CODES.has(normalized);
}

/**
 * Get language info by locale code
 * @param code - Locale code (e.g., 'en_US', 'es-ES', 'en')
 * @returns Language info or undefined if not found
 */
export function getLanguageInfo(code: string): SupportedLanguage | undefined {
  const normalized = normalizeLocaleCode(code);
  return SUPPORTED_LANGUAGES.find((l) => l.code === normalized);
}

/**
 * Get the proficiency tier for a locale code
 * @param code - Locale code
 * @returns Tier or undefined if not supported
 */
export function getLanguageTier(code: string): LanguageTier | undefined {
  return getLanguageInfo(code)?.tier;
}

/**
 * Get all languages in a specific tier
 * @param tier - The proficiency tier
 * @returns Array of languages in that tier
 */
export function getLanguagesByTier(tier: LanguageTier): SupportedLanguage[] {
  switch (tier) {
    case 'high':
      return TIER_1_LANGUAGES;
    case 'good':
      return TIER_2_LANGUAGES;
    case 'functional':
      return TIER_3_LANGUAGES;
  }
}
