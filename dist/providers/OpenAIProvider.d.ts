import { BaseAIProvider } from './BaseAIProvider';
export declare class OpenAIProvider extends BaseAIProvider {
    private client;
    private model;
    constructor(apiKey?: string, model?: string, baseUrl?: string);
    translate(texts: string[], targetLang: string): Promise<string[]>;
    getModelInfo(): {
        name: string;
        capabilities: string[];
    };
}
//# sourceMappingURL=OpenAIProvider.d.ts.map