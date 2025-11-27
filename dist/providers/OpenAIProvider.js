"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const openai_1 = __importDefault(require("openai"));
const BaseAIProvider_1 = require("./BaseAIProvider");
class OpenAIProvider extends BaseAIProvider_1.BaseAIProvider {
    constructor(apiKey, model, baseUrl) {
        super();
        const resolvedApiKey = apiKey || process.env.OPENAI_API_KEY || '';
        this.model = model || process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
        const resolvedBaseUrl = baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        console.log(`[OpenAIProvider] Initializing with:`);
        console.log(`  - API Key: ${resolvedApiKey ? resolvedApiKey.substring(0, 15) + '...' : 'NOT SET'}`);
        console.log(`  - Model: ${this.model}`);
        console.log(`  - Base URL: ${resolvedBaseUrl}`);
        if (!resolvedApiKey) {
            console.warn('OpenAI API Key not provided and not found in environment variables.');
        }
        this.client = new openai_1.default({
            apiKey: resolvedApiKey,
            baseURL: resolvedBaseUrl,
        });
    }
    async translate(texts, targetLang) {
        const langNames = {
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'zh': 'Chinese',
            'ja': 'Japanese',
            'ru': 'Russian',
        };
        const targetLangName = langNames[targetLang] || targetLang;
        const systemPrompt = `You are a professional translation engine. Translate the provided JSON array of strings to ${targetLangName}.
Do not translate HTML tags, class names, or variables.
Maintain the original tone and context.
Return ONLY a JSON array of strings in the exact same order as the input.`;
        try {
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: JSON.stringify(texts) }
                ],
                temperature: 0.3,
                response_format: { type: "json_object" }
            });
            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('No content received from OpenAI');
            }
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
                return parsed;
            }
            else if (parsed.translations && Array.isArray(parsed.translations)) {
                return parsed.translations;
            }
            else {
                const values = Object.values(parsed);
                const arrayValue = values.find(v => Array.isArray(v));
                if (arrayValue) {
                    return arrayValue;
                }
                console.warn('Unexpected JSON structure from OpenAI:', parsed);
                throw new Error('Invalid JSON structure received from OpenAI');
            }
        }
        catch (error) {
            console.error('OpenAI Translation Error:', error);
            throw error;
        }
    }
    getModelInfo() {
        return {
            name: this.model,
            capabilities: ['text-generation', 'translation', 'json-mode']
        };
    }
}
exports.OpenAIProvider = OpenAIProvider;
//# sourceMappingURL=OpenAIProvider.js.map