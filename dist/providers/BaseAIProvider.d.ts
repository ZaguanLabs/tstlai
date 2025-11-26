import { AIProvider } from '../types';
export declare abstract class BaseAIProvider implements AIProvider {
    abstract sendMessage(message: string): Promise<string>;
    abstract getModelInfo(): {
        name: string;
        capabilities: string[];
    };
}
//# sourceMappingURL=BaseAIProvider.d.ts.map