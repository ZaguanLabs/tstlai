"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const BaseAIProvider_1 = require("./BaseAIProvider");
class OpenAIProvider extends BaseAIProvider_1.BaseAIProvider {
    constructor(apiKey, model = 'gpt-3.5-turbo') {
        super();
        this.apiKey = apiKey;
        this.model = model;
    }
    async sendMessage(message) {
        return `OpenAI response to: ${message}`;
    }
    getModelInfo() {
        return {
            name: this.model,
            capabilities: ['text-generation', 'chat']
        };
    }
}
exports.OpenAIProvider = OpenAIProvider;
//# sourceMappingURL=OpenAIProvider.js.map