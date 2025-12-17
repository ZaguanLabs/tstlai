import { OpenAI } from 'openai';
import { BaseAIProvider } from './BaseAIProvider';
import { SUPPORTED_LANGUAGES, SHORT_CODE_DEFAULTS } from '../languages';

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

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;
  private model: string;
  private clientConfig: { apiKey: string; baseURL: string; timeout: number };

  constructor(apiKey?: string, model?: string, baseUrl?: string, timeout?: number) {
    super();
    const resolvedApiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.model = model || process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    const resolvedBaseUrl = baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const resolvedTimeout = timeout || 30000; // Default 30s to allow for cold-start translation of full pages

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
  ): Promise<string[]> {
    const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;

    let systemPrompt = `# Role
You are an expert native translator. You translate content to ${targetLangName} with the fluency and nuance of a highly educated native speaker.

# Context
${context ? `The content is for: ${context}. Adapt the tone to be appropriate for this context.` : 'The content is general web content.'}

# Task
Translate the provided texts into idiomatic ${targetLangName}.

# Style Guide
- **Natural Flow**: Avoid literal translations. Rephrase sentences to sound completely natural to a native speaker.
- **Vocabulary**: Use precise, culturally relevant terminology. Avoid awkward "translationese" or robotic phrasing.
- **Tone**: Maintain the original intent but adapt the wording to fit the target culture's expectations.
- **HTML Safety**: Do NOT translate HTML tags, class names, IDs, or attributes.
- **Interpolation**: Do NOT translate variables (e.g., {{name}}, {count}).
- **Context Hints**: If you see {{__ctx__:...}}, use that hint to disambiguate the translation, then REMOVE the hint from your output. Example: "Save {{__ctx__:button to save file}}" → translate "Save" as a verb for saving files, output only the translated word without the hint.

# Format
Return ONLY a JSON array of strings in the exact same order as the input. Do NOT include any {{__ctx__:...}} markers in your output.`;

    if (excludedTerms && excludedTerms.length > 0) {
      systemPrompt += `\n\n# Exclusions
Do NOT translate the following terms. Keep them exactly as they appear in the source:
${excludedTerms.map((term) => `- ${term}`).join('\n')}`;
    }

    const makeRequest = async () => {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(texts) },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }, // Ensure JSON output
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

      // Handle if the API returns an object with a key like "translations" instead of a direct array
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed.translations && Array.isArray(parsed.translations)) {
        return parsed.translations;
      } else {
        // Try to find the first array value in the object
        const values = Object.values(parsed);
        const arrayValue = values.find((v) => Array.isArray(v));
        if (arrayValue) {
          return arrayValue as string[];
        }

        console.warn('Unexpected JSON structure from OpenAI:', parsed);
        // Fallback: return texts (failed translation) or throw
        throw new Error('Invalid JSON structure received from OpenAI');
      }
    } catch (error) {
      console.error('OpenAI Translation Error:', error);
      throw error;
    }
  }

  /**
   * Stream translations one at a time.
   * Uses OpenAI streaming to parse JSON array elements as they complete.
   */
  async *translateStream(
    texts: string[],
    targetLang: string,
    excludedTerms?: string[],
    context?: string,
  ): AsyncGenerator<{ index: number; translation: string }> {
    const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;

    let systemPrompt = `# Role
You are an expert native translator. You translate content to ${targetLangName} with the fluency and nuance of a highly educated native speaker.

# Context
${context ? `The content is for: ${context}. Adapt the tone to be appropriate for this context.` : 'The content is general web content.'}

# Task
Translate the provided texts into idiomatic ${targetLangName}.

# Style Guide
- **Natural Flow**: Avoid literal translations. Rephrase sentences to sound completely natural to a native speaker.
- **Vocabulary**: Use precise, culturally relevant terminology. Avoid awkward "translationese" or robotic phrasing.
- **Tone**: Maintain the original intent but adapt the wording to fit the target culture's expectations.
- **HTML Safety**: Do NOT translate HTML tags, class names, IDs, or attributes.
- **Interpolation**: Do NOT translate variables (e.g., {{name}}, {count}).
- **Context Hints**: If you see {{__ctx__:...}}, use that hint to disambiguate the translation, then REMOVE the hint from your output.

# Format
Return ONLY a JSON array of strings in the exact same order as the input. Each string on its own line for clarity. Do NOT include any {{__ctx__:...}} markers in your output.`;

    if (excludedTerms && excludedTerms.length > 0) {
      systemPrompt += `\n\n# Exclusions
Do NOT translate the following terms. Keep them exactly as they appear in the source:
${excludedTerms.map((term) => `- ${term}`).join('\n')}`;
    }

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(texts) },
        ],
        temperature: 0.3,
        stream: true,
      });

      let currentIndex = 0;
      let inString = false;
      let escapeNext = false;
      let currentString = '';
      let arrayStarted = false;

      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content || '';

        // Parse the streaming JSON array character by character
        for (const char of content) {
          if (escapeNext) {
            // Handle JSON escape sequences properly
            if (char === 'n') {
              currentString += '\n';
            } else if (char === 't') {
              currentString += '\t';
            } else if (char === 'r') {
              currentString += '\r';
            } else {
              // For \" \\ and other escapes, just add the character itself
              currentString += char;
            }
            escapeNext = false;
            continue;
          }

          if (char === '\\' && inString) {
            // Don't add backslash to output - wait for next char to unescape
            escapeNext = true;
            continue;
          }

          if (char === '"') {
            if (inString) {
              // End of string - we have a complete translation
              if (arrayStarted && currentIndex < texts.length) {
                yield { index: currentIndex, translation: currentString };
                currentIndex++;
              }
              currentString = '';
              inString = false;
            } else {
              // Start of string
              inString = true;
            }
            continue;
          }

          if (char === '[' && !inString) {
            arrayStarted = true;
            continue;
          }

          if (inString) {
            currentString += char;
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
