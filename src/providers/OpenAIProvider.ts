import { BaseAIProvider } from './BaseAIProvider';

export class OpenAIProvider extends BaseAIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-3.5-turbo') {
    super();
    this.apiKey = apiKey;
    this.model = model;
  }

  async translate(texts: string[], targetLang: string): Promise<string[]> {
    // In a real implementation, this would make an API call to OpenAI
    // Constructing the system prompt as per docs
    /*
    const systemPrompt = `You are a translation engine. Translate the provided JSON array of strings to ${targetLang}. 
    Do not translate HTML tags, class names, or variables. 
    Return ONLY a JSON array of strings in the same order.`;
    
    const response = await openai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(texts) }
      ],
      response_format: { type: "json_object" }
    });
    */

    // Mock response for now
    return texts.map(text => `[${targetLang}] ${text}`);
  }

  getModelInfo(): { name: string; capabilities: string[] } {
    return {
      name: this.model,
      capabilities: ['text-generation', 'translation', 'json-mode']
    };
  }
}