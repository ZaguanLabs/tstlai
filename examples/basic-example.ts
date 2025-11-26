// Basic example of TSTLAI usage

import { TSTLAI } from '../src';

// Example 1: Basic usage with placeholder provider
const simpleAI = new TSTLAI({
  provider: {
    type: 'custom'
  }
});

// Send a message
simpleAI.sendMessage('Hello, how are you?')
  .then(response => {
    console.log('AI Response:', response);
  })
  .catch(error => {
    console.error('Error:', error);
  });