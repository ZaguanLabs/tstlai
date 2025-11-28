import OpenAI from 'openai';
import { BaseAIProvider } from './BaseAIProvider';

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, model?: string, baseUrl?: string, timeout?: number) {
    super();
    const resolvedApiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.model = model || process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    const resolvedBaseUrl = baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const resolvedTimeout = timeout || 30000; // Default 30s to allow for cold-start translation of full pages

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

    this.client = new OpenAI({
      apiKey: resolvedApiKey,
      baseURL: resolvedBaseUrl,
      timeout: resolvedTimeout,
    });
  }

  async translate(
    texts: string[],
    targetLang: string,
    excludedTerms?: string[],
    context?: string,
  ): Promise<string[]> {
    // Language name mapping
    const langNames: Record<string, string> = {
      // Tier 1 (High Proficiency)
      en_US: 'English (United States)',
      en_GB: 'English (United Kingdom)',
      de_DE: 'German (Germany)',
      es_ES: 'Spanish (Spain)',
      es_MX: 'Spanish (Mexico)',
      fr_FR: 'French (France)',
      it_IT: 'Italian (Italy)',
      ja_JP: 'Japanese (Japan)',
      pt_BR: 'Portuguese (Brazil)',
      pt_PT: 'Portuguese (Portugal)',
      zh_CN: 'Chinese (Simplified)',
      zh_TW: 'Chinese (Traditional)',

      // Tier 2 (Good)
      ar_SA: 'Arabic (Saudi Arabia)',
      bn_BD: 'Bengali (Bangladesh)',
      cs_CZ: 'Czech (Czech Republic)',
      da_DK: 'Danish (Denmark)',
      el_GR: 'Greek (Greece)',
      fi_FI: 'Finnish (Finland)',
      he_IL: 'Hebrew (Israel)',
      hi_IN: 'Hindi (India)',
      hu_HU: 'Hungarian (Hungary)',
      id_ID: 'Indonesian (Indonesia)',
      ko_KR: 'Korean (South Korea)',
      nl_NL: 'Dutch (Netherlands)',
      nb_NO: 'Norwegian (Norway)',
      pl_PL: 'Polish (Poland)',
      ro_RO: 'Romanian (Romania)',
      ru_RU: 'Russian (Russia)',
      sv_SE: 'Swedish (Sweden)',
      th_TH: 'Thai (Thailand)',
      tr_TR: 'Turkish (Turkey)',
      uk_UA: 'Ukrainian (Ukraine)',
      vi_VN: 'Vietnamese (Vietnam)',

      // Tier 3 (Functional)
      bg_BG: 'Bulgarian (Bulgaria)',
      ca_ES: 'Catalan (Spain)',
      fa_IR: 'Persian (Iran)',
      hr_HR: 'Croatian (Croatia)',
      lt_LT: 'Lithuanian (Lithuania)',
      lv_LV: 'Latvian (Latvia)',
      ms_MY: 'Malay (Malaysia)',
      sk_SK: 'Slovak (Slovakia)',
      sl_SI: 'Slovenian (Slovenia)',
      sr_RS: 'Serbian (Serbia)',
      sw_KE: 'Swahili (Kenya)',
      tl_PH: 'Tagalog (Philippines)',
      ur_PK: 'Urdu (Pakistan)',

      // Fallbacks
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      zh: 'Chinese',
      ja: 'Japanese',
      ru: 'Russian',
      ko: 'Korean',
    };

    const targetLangName = langNames[targetLang] || targetLang;

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

# Format
Return ONLY a JSON array of strings in the exact same order as the input.`;

    if (excludedTerms && excludedTerms.length > 0) {
      systemPrompt += `\n\n# Exclusions
Do NOT translate the following terms. Keep them exactly as they appear in the source:
${excludedTerms.map((term) => `- ${term}`).join('\n')}`;
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(texts) },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }, // Ensure JSON output
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI');
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

  getModelInfo(): { name: string; capabilities: string[] } {
    return {
      name: this.model,
      capabilities: ['text-generation', 'translation', 'json-mode'],
    };
  }
}
