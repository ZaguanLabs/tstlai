// Comprehensive example of TSTLAI usage

import { TSTLAI, TSTLAIConfig } from './src';

async function runExample() {
  console.log('=== TSTLAI Example ===\n');

  // Example 1: Using the placeholder provider
  console.log('1. Using placeholder provider:');
  const config1: TSTLAIConfig = {
    provider: {
      type: 'custom'
    }
  };

  const ai1 = new TSTLAI(config1);
  
  const response1 = await ai1.sendMessage('Hello, what can you do?');
  console.log('Response:', response1);
  
  const response2 = await ai1.sendMessage('Tell me a joke');
  console.log('Response:', response2);
  
  console.log('Conversation history:');
  console.log(ai1.getConversationHistory());
  console.log();

  // Example 2: Using OpenAI provider (placeholder)
  console.log('2. OpenAI provider configuration:');
  const config2: TSTLAIConfig = {
    provider: {
      type: 'openai',
      apiKey: 'your-openai-api-key',
      model: 'gpt-3.5-turbo'
    },
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7
  };

  const ai2 = new TSTLAI(config2);
  console.log('Provider info:', ai2.getProviderInfo());
  console.log();

  // Example 3: Conversation management
  console.log('3. Conversation management:');
  const ai3 = new TSTLAI({ provider: { type: 'custom' } });
  
  await ai3.sendMessage('What is the capital of France?');
  await ai3.sendMessage('What about Germany?');
  
  console.log('Before clearing:');
  console.log(`Conversation has ${ai3.getConversationHistory().length} messages`);
  
  ai3.clearConversation();
  
  console.log('After clearing:');
  console.log(`Conversation has ${ai3.getConversationHistory().length} messages`);
}

// Run the example
runExample().catch(console.error);