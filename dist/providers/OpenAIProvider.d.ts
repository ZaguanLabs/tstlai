import { BaseAIProvider } from './BaseAIProvider';
export declare class OpenAIProvider extends BaseAIProvider {
    private apiKey;
    private model;
    private baseUrl;
    constructor(apiKey?: string, model?: string, baseUrl?: string);
    translate(texts: string[], targetLang: string): Promise<string[]>;
    getModelInfo(): {
        name: string;
        capabilities: string[];
    };
}
//# sourceMappingURL=OpenAIProvider.d.ts.map