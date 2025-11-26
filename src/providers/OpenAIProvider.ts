import { BaseAIProvider } from './BaseAIProvider';

export class OpenAIProvider extends BaseAIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-3.5-turbo') {
    super();
    this.apiKey = apiKey;
    this.model = model;
  }

  async sendMessage(message: string): Promise<string> {
    // In a real implementation, this would make an API call to OpenAI
    // For now, we'll return a placeholder response
    return `OpenAI response to: ${message}`;
  }

  getModelInfo(): { name: string; capabilities: string[] } {
    return {
      name: this.model,
      capabilities: ['text-generation', 'chat']
    };
  }
}