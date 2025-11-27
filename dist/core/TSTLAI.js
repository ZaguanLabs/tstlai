"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TSTLAI = void 0;
const OpenAIProvider_1 = require("../providers/OpenAIProvider");
const HTMLProcessor_1 = require("./HTMLProcessor");
const Cache_1 = require("./Cache");
class TSTLAI {
    constructor(config) {
        this.config = config;
        this.htmlProcessor = new HTMLProcessor_1.HTMLProcessor();
        this.provider = this.initializeProvider(config.provider);
        this.cache = this.initializeCache(config.cache);
    }
    initializeProvider(providerConfig) {
        switch (providerConfig.type) {
            case 'openai':
                return new OpenAIProvider_1.OpenAIProvider(providerConfig.apiKey || '', providerConfig.model);
            default:
                return {
                    translate: async (texts, targetLang) => {
                        return texts.map(t => `[MOCK ${targetLang}] ${t}`);
                    },
                    getModelInfo: () => ({ name: 'mock', capabilities: [] })
                };
        }
    }
    initializeCache(cacheConfig) {
        if (cacheConfig?.type === 'redis') {
            console.warn('Redis cache not implemented yet, falling back to memory');
        }
        return new Cache_1.InMemoryCache(cacheConfig?.ttl);
    }
    async process(html) {
        const targetLang = this.config.targetLang;
        const root = this.htmlProcessor.parse(html);
        const textNodes = this.htmlProcessor.extractTextNodes(root);
        if (textNodes.length === 0) {
            return { html, translatedCount: 0, cachedCount: 0 };
        }
        const translations = new Map();
        const cacheMisses = [];
        let cachedCount = 0;
        await Promise.all(textNodes.map(async (node) => {
            const cacheKey = `${node.hash}:${targetLang}`;
            const cachedText = await this.cache.get(cacheKey);
            if (cachedText) {
                translations.set(node.hash, cachedText);
                cachedCount++;
            }
            else {
                if (!cacheMisses.find(m => m.hash === node.hash)) {
                    cacheMisses.push(node);
                }
            }
        }));
        let translatedCount = 0;
        if (cacheMisses.length > 0) {
            const textsToTranslate = cacheMisses.map(n => n.text);
            try {
                const translatedTexts = await this.provider.translate(textsToTranslate, targetLang);
                cacheMisses.forEach(async (node, index) => {
                    const translation = translatedTexts[index];
                    if (translation) {
                        translations.set(node.hash, translation);
                        const cacheKey = `${node.hash}:${targetLang}`;
                        await this.cache.set(cacheKey, translation);
                    }
                });
                translatedCount = cacheMisses.length;
            }
            catch (error) {
                console.error('Translation failed:', error);
            }
        }
        this.htmlProcessor.applyTranslations(textNodes, translations);
        return {
            html: root.toString(),
            translatedCount,
            cachedCount
        };
    }
}
exports.TSTLAI = TSTLAI;
//# sourceMappingURL=TSTLAI.js.map