import { OpenAI } from 'openai';
import { BaseAIProvider } from './BaseAIProvider';
import { TranslationStreamParser } from './TranslationStreamParser';
import { SUPPORTED_LANGUAGES, SHORT_CODE_DEFAULTS, normalizeLocaleCode } from '../languages';
import type { AIProviderConfig, TranslationStyle, TranslationRequestOptions } from '../types';

/**
 * Build a mapping of locale codes to human-readable language names.
 * Includes both full locale codes (e.g., 'en_US') and short codes (e.g., 'en').
 */
function buildLanguageNameMap(): Record<string, string> {
  const langNames: Record<string, string> = {};

  // Add all supported languages with full locale codes
  for (const lang of SUPPORTED_LANGUAGES) {
    langNames[lang.code] = `${lang.language} (${lang.region})`;
  }

  // Add short code fallbacks by resolving to their default locale
  for (const [shortCode, fullCode] of Object.entries(SHORT_CODE_DEFAULTS)) {
    const lang = SUPPORTED_LANGUAGES.find((l) => l.code === fullCode);
    if (lang) {
      // Use just the language name for short codes (e.g., 'en' -> 'English')
      langNames[shortCode] = lang.language;
    }
  }

  return langNames;
}

// Pre-build the language name map once
const LANGUAGE_NAMES = buildLanguageNameMap();

/**
 * Language-specific locale clarifications.
 * Helps the model understand which variant to use.
 */
const LOCALE_CLARIFICATIONS: Record<string, string> = {
  // Norwegian variants
  nb_NO: 'Use Norwegian Bokmål (nb-NO), not Nynorsk.',
  nb: 'Use Norwegian Bokmål (nb-NO), not Nynorsk.',
  no: 'Use Norwegian Bokmål (nb-NO).', // 'no' is ambiguous, defaults to Bokmål
  nn_NO: 'Use Norwegian Nynorsk (nn-NO), not Bokmål.',
  nn: 'Use Norwegian Nynorsk (nn-NO), not Bokmål.',
  // Chinese variants
  zh_CN: 'Use Simplified Chinese characters.',
  zh_TW: 'Use Traditional Chinese characters.',
  zh: 'Use Simplified Chinese characters.',
  // Portuguese variants
  pt_BR: 'Use Brazilian Portuguese conventions.',
  pt_PT: 'Use European Portuguese conventions.',
  pt: 'Use Brazilian Portuguese conventions.',
  // English variants
  en_GB: 'Use British English spelling and conventions.',
  en_US: 'Use American English spelling and conventions.',
  // Spanish variants
  es_ES: 'Use Castilian Spanish (Spain) conventions.',
  es_MX: 'Use Mexican Spanish conventions.',
};

/**
 * Style descriptions for the translation register.
 */
const STYLE_DESCRIPTIONS: Record<TranslationStyle, string> = {
  formal:
    'Use formal, professional language suitable for official documents or business communication.',
  neutral: 'Use a neutral, professional tone suitable for general web content and documentation.',
  casual:
    'Use casual, conversational language suitable for blogs, social media, or friendly communication.',
  marketing:
    'Use persuasive, engaging language suitable for marketing copy, landing pages, and promotional content.',
  technical:
    'Use precise, technical language suitable for developer documentation, API references, and technical guides.',
};

/**
 * Build the system prompt for translation.
 * Centralizes all prompt logic for consistency between translate() and translateStream().
 *
 * @param targetLang - Target language code
 * @param targetLangName - Human-readable language name
 * @param context - Optional context for the translation
 * @param excludedTerms - Terms to keep untranslated
 * @param glossary - Optional user-provided glossary of preferred translations
 * @param style - Optional style/register for the translation
 */
function buildSystemPrompt(
  targetLang: string,
  targetLangName: string,
  context?: string,
  excludedTerms?: string[],
  glossary?: Record<string, string>,
  style?: TranslationStyle,
): string {
  const normalizedLang = normalizeLocaleCode(targetLang);
  const localeHint =
    LOCALE_CLARIFICATIONS[targetLang] || LOCALE_CLARIFICATIONS[normalizedLang] || '';
  const styleDesc = style ? STYLE_DESCRIPTIONS[style] : STYLE_DESCRIPTIONS.neutral;

  let prompt = `# Role
You are an expert native translator. You translate content to ${targetLangName} with the fluency and nuance of a highly educated native speaker.

# Context
${context ? `The content is for: ${context}. Adapt the tone to be appropriate for this context.` : 'The content is general web content.'}

# Register
${styleDesc}

# Task
Translate the provided texts into natural, native ${targetLangName}. Preserve the original meaning, intent, and function of each text, not its source-language wording or sentence structure.

# Method
**Understand first, then translate**: Before translating each text, determine what it is doing for the user, not just what it says. Identify its meaning, intent, tone, and likely function on the page or in the product.

**Translate by function**: Choose wording according to the text's role. Navigation, labels, controls, and settings should be brief, conventional, and immediately understandable. Marketing or persuasive copy should preserve the intended user impact and be rewritten freely when needed to sound native. Informational prose should be clear, fluent, and faithful. Legal, policy, account, billing, error, and support text should be translated conservatively and precisely.

**Intent over wording**: Translate the intended meaning and user-facing effect of the text, not its exact phrasing. When a literal rendering sounds unnatural, stiff, ambiguous, or foreign, replace it with the expression a native speaker would naturally use.

# Style Guide
- **Natural Flow**: Avoid literal translations. Rephrase as needed so the result reads like original writing in ${targetLangName}, not a translation.
- **Vocabulary**: Use precise, culturally appropriate, domain-appropriate terminology. Prefer standard native phrasing over source-language structure.
- **Tone**: Preserve the source's intent and level of formality. Do not arbitrarily make precise text more casual or persuasive text more flat.
- **Function**: Headings should read like headings, buttons like native buttons, labels like native labels, help text like help text, and legal text like legal text.
- **Idioms and Metaphors**: Never translate idioms or figurative language literally. Use a natural equivalent, or rewrite the phrase entirely if needed.
- **Consistency**: Keep terminology, register, and form of address consistent unless the source clearly changes them.
- **Do No Harm**: Do not invent claims, emphasis, specificity, or meaning. Do not omit important qualifiers or soften warnings and limitations.
- **HTML/Code Safety**: Do NOT translate HTML tags, class names, IDs, attributes, URLs, email addresses, or content inside backticks or <code> blocks.
- **Interpolation**: Do NOT translate variables or placeholders (e.g., {{name}}, {count}, %s, $1).
- **Formatting**: Preserve meaningful whitespace (leading/trailing spaces, multiple spaces, newlines). Do not introduce or remove leading/trailing whitespace. Use idiomatic punctuation for the target language.
- **Context Hints**: If you see {{__ctx__:...}}, use that hint to disambiguate the translation, then REMOVE the hint from your output.

# Quality Check
After translating each string, verify that it: (1) preserves the original meaning and function, (2) sounds native in ${targetLangName}, (3) uses the right style for the text type, and (4) contains no calques or translationese. If a phrase sounds translated, rewrite it with the wording a native speaker would actually expect.

# Format
Return a valid JSON object with a single key "translations" containing an array of strings in the exact same order as the input.
Example: { "translations": ["translated string 1", "translated string 2"] }
- Do NOT wrap in Markdown code blocks.
- Do NOT include any {{__ctx__:...}} markers in your output.`;

  // Add locale clarification if available
  if (localeHint) {
    prompt += `\n- **Locale**: ${localeHint}`;
  }

  // Add user-provided glossary if available
  const glossaryEntries = glossary ? Object.entries(glossary) : [];
  if (glossaryEntries.length > 0) {
    prompt += `\n\n# Glossary\nWhen you encounter these phrases, prefer these translations (unless context demands otherwise):`;
    for (const [source, target] of glossaryEntries) {
      prompt += `\n- "${source}" → ${target}`;
    }
  }

  // Add exclusions if provided
  if (excludedTerms && excludedTerms.length > 0) {
    prompt += `\n\n# Exclusions\nDo NOT translate the following terms. Keep them exactly as they appear in the source:\n${excludedTerms.map((term) => `- ${term}`).join('\n')}`;
  }

  return prompt;
}

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;
  private model: string;
  private generationOptions: Pick<
    AIProviderConfig,
    'temperature' | 'maxCompletionTokens' | 'reasoningEffort'
  >;

  constructor(
    apiKey?: string,
    model?: string,
    baseUrl?: string,
    timeout?: number,
    generationOptions: OpenAIProvider['generationOptions'] = {},
  ) {
    super();
    if (
      generationOptions.maxCompletionTokens !== undefined &&
      (!Number.isInteger(generationOptions.maxCompletionTokens) ||
        generationOptions.maxCompletionTokens <= 0)
    ) {
      throw new Error('maxCompletionTokens must be a positive integer');
    }
    this.generationOptions = { ...generationOptions };
    const resolvedApiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.model = model || process.env.OPENAI_MODEL || 'gpt-5.2-mini';
    const resolvedBaseUrl = baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const resolvedTimeout = timeout || 120000; // Default 120s to allow for cold-start translation of full pages

    const clientConfig = {
      apiKey: resolvedApiKey,
      baseURL: resolvedBaseUrl,
      timeout: resolvedTimeout,
    };

    // Debug logging (only in development)
    if (process.env.NODE_ENV === 'development' || process.env.TSTLAI_DEBUG) {
      console.log(`[OpenAIProvider] Initializing with:`);
      console.log(`  - API Key: ${resolvedApiKey ? 'configured' : 'NOT SET'}`);
      console.log(`  - Model: ${this.model}`);
      console.log(`  - Base URL: ${resolvedBaseUrl}`);
      console.log(`  - Timeout: ${resolvedTimeout}ms`);
    }

    if (!resolvedApiKey) {
      console.warn('[OpenAIProvider] API Key not provided and not found in environment variables.');
    }

    this.client = new OpenAI(clientConfig);
  }

  private buildRequest(
    texts: string[],
    systemPrompt: string,
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    const {
      temperature = 0.1,
      maxCompletionTokens,
      reasoningEffort = 'none',
    } = this.generationOptions;
    return {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(texts) },
      ],
      response_format: { type: 'json_object' },
      ...(temperature !== null ? { temperature } : {}),
      ...(maxCompletionTokens !== undefined ? { max_completion_tokens: maxCompletionTokens } : {}),
      reasoning_effort: reasoningEffort,
    };
  }

  private parseTranslations(content: string, expectedCount: number): string[] {
    const parsed: unknown = JSON.parse(content);
    // Retain support for legacy array responses and objects with a differently named array.
    const translations = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
        ? 'translations' in parsed
          ? parsed.translations
          : Object.values(parsed).find(Array.isArray)
        : undefined;

    if (!Array.isArray(translations) || !translations.every((value) => typeof value === 'string')) {
      throw new Error('Invalid translation response: expected an array of strings');
    }
    if (translations.length !== expectedCount) {
      throw new Error(
        `Incomplete translation response: expected ${expectedCount} translations, received ${translations.length}`,
      );
    }
    return translations;
  }

  private checkFinishReason(reason: string | null | undefined): void {
    if (reason && reason !== 'stop') {
      throw new Error(`Translation did not complete (finish_reason: ${reason})`);
    }
  }

  async translate(
    texts: string[],
    targetLang: string,
    excludedTerms?: string[],
    context?: string,
    glossary?: Record<string, string>,
    style?: TranslationStyle,
    options: TranslationRequestOptions = {},
  ): Promise<string[]> {
    const targetLangName = LANGUAGE_NAMES[normalizeLocaleCode(targetLang)] || targetLang;
    const systemPrompt = buildSystemPrompt(
      targetLang,
      targetLangName,
      context,
      excludedTerms,
      glossary,
      style,
    );

    const makeRequest = async () => {
      const response = await this.client.chat.completions.create(
        this.buildRequest(texts, systemPrompt),
        { signal: options.signal },
      );

      if (!response) {
        throw new Error('OpenAI client returned undefined response');
      }
      if (!response.choices || response.choices.length === 0) {
        throw new Error('Empty response from OpenAI - no choices returned');
      }
      this.checkFinishReason(response.choices[0].finish_reason);
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI');
      }
      return content;
    };

    try {
      const content = await makeRequest();
      return this.parseTranslations(content, texts.length);
    } catch (error) {
      if (!options.signal?.aborted) console.error('OpenAI Translation Error:', error);
      throw error;
    }
  }

  /**
   * Stream translations with true progressive yielding.
   * Parses the JSON array incrementally and yields each translation as it completes.
   */
  async *translateStream(
    texts: string[],
    targetLang: string,
    excludedTerms?: string[],
    context?: string,
    glossary?: Record<string, string>,
    style?: TranslationStyle,
    options: TranslationRequestOptions = {},
  ): AsyncGenerator<{ index: number; translation: string }> {
    const targetLangName = LANGUAGE_NAMES[normalizeLocaleCode(targetLang)] || targetLang;
    const systemPrompt = buildSystemPrompt(
      targetLang,
      targetLangName,
      context,
      excludedTerms,
      glossary,
      style,
    );

    try {
      const stream = await this.client.chat.completions.create(
        {
          ...this.buildRequest(texts, systemPrompt),
          stream: true,
        },
        { signal: options.signal },
      );

      const parser = new TranslationStreamParser(texts.length);
      let fullContent = '';
      for await (const chunk of stream) {
        this.checkFinishReason(chunk.choices?.[0]?.finish_reason);
        const content = chunk.choices?.[0]?.delta?.content || '';
        fullContent += content;
        yield* parser.push(content);
      }
      const translations = this.parseTranslations(fullContent, texts.length);
      // Legacy object envelopes are validated in full before being emitted. Named
      // translations and root arrays still arrive progressively as strings complete.
      if (parser.emittedCount === 0) {
        for (const [index, translation] of translations.entries()) yield { index, translation };
      } else if (parser.emittedCount !== texts.length) {
        throw new Error(
          `Incomplete translation stream: expected ${texts.length} translations, received ${parser.emittedCount}`,
        );
      }
    } catch (error) {
      if (!options.signal?.aborted) console.error('OpenAI Streaming Translation Error:', error);
      throw error;
    }
  }

  /** Check if this provider supports streaming */
  supportsStreaming(): boolean {
    return true;
  }

  getModelInfo(): { name: string; capabilities: string[] } {
    return {
      name: this.model,
      capabilities: ['text-generation', 'translation', 'json-mode', 'streaming'],
    };
  }
}
