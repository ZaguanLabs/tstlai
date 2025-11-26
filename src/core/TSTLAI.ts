import { AIProvider, ConversationMessage, TSTLAIConfig } from '../types';
import { OpenAIProvider } from '../providers/OpenAIProvider';

export class TSTLAI {
  private config: TSTLAIConfig;
  private provider: AIProvider;
  private conversationHistory: ConversationMessage[];

  constructor(config: TSTLAIConfig) {
    this.config = config;
    this.conversationHistory = [];

    // Initialize the AI provider based on config
    this.provider = this.initializeProvider(config.provider);
  }

  private initializeProvider(providerConfig: any): AIProvider {
    switch (providerConfig.type) {
      case 'openai':
        if (!providerConfig.apiKey) {
          throw new Error('OpenAI provider requires an API key');
        }
        return new OpenAIProvider(providerConfig.apiKey, providerConfig.model);
      default:
        // Fallback to placeholder provider
        return {
          sendMessage: async (message: string) => {
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

  async sendMessage(message: string): Promise<string> {
    // Add user message to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // Send message to AI provider
    const response = await this.provider.sendMessage(message);

    // Add AI response to conversation history
    this.conversationHistory.push({
      role: 'assistant',
      content: response,
      timestamp: new Date()
    });

    return response;
  }

  getConversationHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  clearConversation(): void {
    this.conversationHistory = [];
  }

  getConfig(): TSTLAIConfig {
    return { ...this.config };
  }

  getProviderInfo(): { name: string; capabilities: string[] } {
    return this.provider.getModelInfo();
  }
}