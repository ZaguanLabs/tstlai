import { BaseAIProvider } from './BaseAIProvider';
export declare class OpenAIProvider extends BaseAIProvider {
    private apiKey;
    private model;
    constructor(apiKey: string, model?: string);
    sendMessage(message: string): Promise<string>;
    getModelInfo(): {
        name: string;
        capabilities: string[];
    };
}
//# sourceMappingURL=OpenAIProvider.d.ts.map