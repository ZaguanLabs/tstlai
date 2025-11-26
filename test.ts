import { TSTLAI } from './src';

async function test() {
  // Test with placeholder provider
  const ai = new TSTLAI({
    provider: {
      type: 'custom'
    }
  });

  console.log('Sending message...');
  const response = await ai.sendMessage('Hello, how are you?');
  console.log('Response:', response);
  
  console.log('Conversation history:');
  console.log(ai.getConversationHistory());
}

test().catch(console.error);