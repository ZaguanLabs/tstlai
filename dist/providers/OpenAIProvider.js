"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const BaseAIProvider_1 = require("./BaseAIProvider");
class OpenAIProvider extends BaseAIProvider_1.BaseAIProvider {
    constructor(apiKey, model, baseUrl) {
        super();
        this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
        this.model = model || process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
        this.baseUrl = baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        if (!this.apiKey) {
            console.warn('OpenAI API Key not provided and not found in environment variables.');
        }
    }
    async translate(texts, targetLang) {
        console.log(`[OpenAIProvider] Translating with Model: ${this.model}, BaseURL: ${this.baseUrl}`);
        return texts.map(text => `[${targetLang}] ${text}`);
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