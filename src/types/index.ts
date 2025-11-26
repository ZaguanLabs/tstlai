export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface AIProvider {
  sendMessage: (message: string) => Promise<string>;
  getModelInfo: () => { name: string; capabilities: string[] };
}

export interface TSTLAIConfig {
  provider: {
    type: 'openai' | 'anthropic' | 'google' | 'custom';
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}