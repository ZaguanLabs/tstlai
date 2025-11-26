import { ConversationMessage, TSTLAIConfig } from '../types';
export declare class TSTLAI {
    private config;
    private provider;
    private conversationHistory;
    constructor(config: TSTLAIConfig);
    private initializeProvider;
    sendMessage(message: string): Promise<string>;
    getConversationHistory(): ConversationMessage[];
    clearConversation(): void;
    getConfig(): TSTLAIConfig;
    getProviderInfo(): {
        name: string;
        capabilities: string[];
    };
}
//# sourceMappingURL=TSTLAI.d.ts.map