"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TSTLAI = void 0;
const OpenAIProvider_1 = require("../providers/OpenAIProvider");
class TSTLAI {
    constructor(config) {
        this.config = config;
        this.conversationHistory = [];
        this.provider = this.initializeProvider(config.provider);
    }
    initializeProvider(providerConfig) {
        switch (providerConfig.type) {
            case 'openai':
                if (!providerConfig.apiKey) {
                    throw new Error('OpenAI provider requires an API key');
                }
                return new OpenAIProvider_1.OpenAIProvider(providerConfig.apiKey, providerConfig.model);
            default:
                return {
                    sendMessage: async (message) => {
                        return `Response to: ${message}`;
                    },
                    getModelInfo: () => {
                        return {
                            name: 'placeholder',
                            capabilities: []
                        };
                    }
                };
        }
    }
    async sendMessage(message) {
        this.conversationHistory.push({
            role: 'user',
            content: message,
            timestamp: new Date()
        });
        const response = await this.provider.sendMessage(message);
        this.conversationHistory.push({
            role: 'assistant',
            content: response,
            timestamp: new Date()
        });
        return response;
    }
    getConversationHistory() {
        return [...this.conversationHistory];
    }
    clearConversation() {
        this.conversationHistory = [];
    }
    getConfig() {
        return { ...this.config };
    }
    getProviderInfo() {
        return this.provider.getModelInfo();
    }
}
exports.TSTLAI = TSTLAI;
//# sourceMappingURL=TSTLAI.js.map