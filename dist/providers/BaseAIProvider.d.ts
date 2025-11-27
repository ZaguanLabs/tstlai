import { AIProvider } from '../types';
export declare abstract class BaseAIProvider implements AIProvider {
    abstract translate(texts: string[], targetLang: string): Promise<string[]>;
    abstract getModelInfo(): {
        name: string;
        capabilities: string[];
    };
}
//# sourceMappingURL=BaseAIProvider.d.ts.map