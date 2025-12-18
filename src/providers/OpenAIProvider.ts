import { OpenAI } from 'openai';
import { BaseAIProvider } from './BaseAIProvider';
import { SUPPORTED_LANGUAGES, SHORT_CODE_DEFAULTS, normalizeLocaleCode } from '../languages';
import type { TranslationStyle } from '../types';

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
Translate the provided texts into idiomatic ${targetLangName}.

# Style Guide
- **Natural Flow**: Avoid literal translations. Rephrase sentences to sound completely natural to a native speaker.
- **Vocabulary**: Use precise, culturally relevant terminology. Avoid awkward "translationese" or robotic phrasing.
- **Tone**: Maintain the original intent but adapt the wording to fit the target culture's expectations.
- **Idioms**: Never translate idioms literally. Replace English idioms with natural ${targetLangName} equivalents.
- **HTML/Code Safety**: Do NOT translate HTML tags, class names, IDs, attributes, URLs, email addresses, or content inside backticks or <code> blocks.
- **Interpolation**: Do NOT translate variables or placeholders (e.g., {{name}}, {count}, %s, $1).
- **Formatting**: Preserve meaningful whitespace (leading/trailing spaces, multiple spaces, newlines). Do not introduce or remove leading/trailing whitespace. Use idiomatic punctuation for the target language.
- **Context Hints**: If you see {{__ctx__:...}}, use that hint to disambiguate the translation, then REMOVE the hint from your output.`;

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

  // Add self-check instruction
  prompt += `\n\n# Quality Check\nAfter translating each string, verify it sounds like native ${targetLangName} and not a calque. If any phrase sounds like a literal translation, rewrite it naturally.`;

  // Add format requirements - use object envelope to match json_object mode
  prompt += `\n\n# Format\nReturn a valid JSON object with a single key "translations" containing an array of strings in the exact same order as the input.\nExample: { "translations": ["translated string 1", "translated string 2"] }\n- Do NOT wrap in Markdown code blocks.\n- Do NOT include any {{__ctx__:...}} markers in your output.`;

  // Add exclusions if provided
  if (excludedTerms && excludedTerms.length > 0) {
    prompt += `\n\n# Exclusions\nDo NOT translate the following terms. Keep them exactly as they appear in the source:\n${excludedTerms.map((term) => `- ${term}`).join('\n')}`;
  }

  return prompt;
}

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;
  private model: string;
  private clientConfig: { apiKey: string; baseURL: string; timeout: number };

  constructor(apiKey?: string, model?: string, baseUrl?: string, timeout?: number) {
    super();
    const resolvedApiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.model = model || process.env.OPENAI_MODEL || 'gpt-5.2-mini';
    const resolvedBaseUrl = baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const resolvedTimeout = timeout || 120000; // Default 120s to allow for cold-start translation of full pages

    // Store config for client recreation
    this.clientConfig = {
      apiKey: resolvedApiKey,
      baseURL: resolvedBaseUrl,
      timeout: resolvedTimeout,
    };

    // Debug logging (only in development)
    if (process.env.NODE_ENV === 'development' || process.env.TSTLAI_DEBUG) {
      console.log(`[OpenAIProvider] Initializing with:`);
      console.log(
        `  - API Key: ${resolvedApiKey ? resolvedApiKey.substring(0, 15) + '...' : 'NOT SET'}`,
      );
      console.log(`  - Model: ${this.model}`);
      console.log(`  - Base URL: ${resolvedBaseUrl}`);
      console.log(`  - Timeout: ${resolvedTimeout}ms`);
    }

    if (!resolvedApiKey) {
      console.warn('[OpenAIProvider] API Key not provided and not found in environment variables.');
    }

    this.client = new OpenAI(this.clientConfig);
  }

  private recreateClient(): void {
    console.warn('[OpenAIProvider] Recreating client due to stale connection');
    this.client = new OpenAI(this.clientConfig);
  }

  async translate(
    texts: string[],
    targetLang: string,
    excludedTerms?: string[],
    context?: string,
    glossary?: Record<string, string>,
    style?: TranslationStyle,
  ): Promise<string[]> {
    const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;
    const systemPrompt = buildSystemPrompt(
      targetLang,
      targetLangName,
      context,
      excludedTerms,
      glossary,
      style,
    );

    const makeRequest = async () => {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(texts) },
        ],
        temperature: 0.1, // Low temperature for consistent, deterministic translations
        response_format: { type: 'json_object' }, // Matches prompt's { "translations": [...] } format
      });

      if (!response) {
        throw new Error('OpenAI client returned undefined response');
      }
      if (!response.choices || response.choices.length === 0) {
        throw new Error('Empty response from OpenAI - no choices returned');
      }
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI');
      }
      return content;
    };

    try {
      let content: string;
      try {
        content = await makeRequest();
      } catch (firstError) {
        // If we get an undefined response or connection error, recreate client and retry once
        const isStaleConnection =
          firstError instanceof TypeError ||
          (firstError instanceof Error &&
            (firstError.message.includes('undefined') ||
              firstError.message.includes('ECONNRESET') ||
              firstError.message.includes('socket hang up')));

        if (isStaleConnection) {
          this.recreateClient();
          content = await makeRequest();
        } else {
          throw firstError;
        }
      }

      const parsed = JSON.parse(content);

      // Expected format: { "translations": ["...", "..."] }
      if (parsed.translations && Array.isArray(parsed.translations)) {
        return parsed.translations;
      }

      // Fallback: handle legacy array format or find first array in object
      if (Array.isArray(parsed)) {
        return parsed;
      }

      const values = Object.values(parsed);
      const arrayValue = values.find((v) => Array.isArray(v));
      if (arrayValue) {
        return arrayValue as string[];
      }

      console.warn('Unexpected JSON structure from OpenAI:', parsed);
      throw new Error('Invalid JSON structure received from OpenAI');
    } catch (error) {
      console.error('OpenAI Translation Error:', error);
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
  ): AsyncGenerator<{ index: number; translation: string }> {
    const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;
    const systemPrompt = buildSystemPrompt(
      targetLang,
      targetLangName,
      context,
      excludedTerms,
      glossary,
      style,
    );

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(texts) },
        ],
        temperature: 0.1, // Low temperature for consistent, deterministic translations
        stream: true,
      });

      // Incremental JSON array parser state
      // Response format: { "translations": ["str1", "str2", ...] }
      let buffer = '';
      let inTranslationsArray = false;
      let inString = false;
      let escapeNext = false;
      let arrayDepth = 0; // Depth within the translations array
      let currentElement = '';
      let elementIndex = 0;

      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content || '';
        buffer += content;

        // Process buffer character by character
        while (buffer.length > 0) {
          const char = buffer[0];
          buffer = buffer.slice(1);

          // Handle escape sequences inside strings
          if (escapeNext) {
            if (inString) currentElement += char;
            escapeNext = false;
            continue;
          }

          if (char === '\\' && inString) {
            currentElement += char;
            escapeNext = true;
            continue;
          }

          // Handle string boundaries
          if (char === '"') {
            if (inString) {
              // End of string
              currentElement += char;
              inString = false;

              // If we're at depth 1 in the translations array, this completes an element
              if (inTranslationsArray && arrayDepth === 1) {
                try {
                  const translation = JSON.parse(currentElement);
                  if (typeof translation === 'string' && elementIndex < texts.length) {
                    yield { index: elementIndex, translation };
                    elementIndex++;
                  }
                } catch {
                  // Incomplete or invalid JSON, continue accumulating
                }
                currentElement = '';
              }
            } else {
              // Start of string
              inString = true;
              currentElement += char;
            }
            continue;
          }

          // Inside a string, accumulate everything
          if (inString) {
            currentElement += char;
            continue;
          }

          // Track array depth - we're looking for the translations array
          if (char === '[') {
            if (!inTranslationsArray) {
              // This is the start of the translations array
              inTranslationsArray = true;
              arrayDepth = 1;
            } else {
              // Nested array inside a translation (rare but possible)
              arrayDepth++;
              currentElement += char;
            }
            continue;
          }

          if (char === ']') {
            if (inTranslationsArray) {
              arrayDepth--;
              if (arrayDepth === 0) {
                inTranslationsArray = false;
              } else if (arrayDepth > 0) {
                currentElement += char;
              }
            }
            continue;
          }

          // Track nested objects inside array elements
          if (char === '{') {
            if (inTranslationsArray && arrayDepth >= 1) {
              currentElement += char;
            }
            continue;
          }

          if (char === '}') {
            if (inTranslationsArray && arrayDepth >= 1 && currentElement.length > 0) {
              currentElement += char;
            }
            continue;
          }

          // Commas separate array elements at depth 1
          if (char === ',' && inTranslationsArray && arrayDepth === 1) {
            currentElement = '';
            continue;
          }

          // Accumulate other characters if inside array element
          if (inTranslationsArray && arrayDepth >= 1 && currentElement.length > 0) {
            currentElement += char;
          }
        }
      }
    } catch (error) {
      console.error('OpenAI Streaming Translation Error:', error);
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
