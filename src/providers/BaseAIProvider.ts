import { AIProvider } from '../types';

export abstract class BaseAIProvider implements AIProvider {
  abstract translate(texts: string[], targetLang: string): Promise<string[]>;
  abstract getModelInfo(): { name: string; capabilities: string[] };
}
