import { AIProvider } from '../types';

export abstract class BaseAIProvider implements AIProvider {
  abstract sendMessage(message: string): Promise<string>;
  abstract getModelInfo(): { name: string; capabilities: string[] };
}