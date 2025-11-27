// Basic example of Tstlai Translation Engine usage

import { Tstlai } from '../src';

async function run() {
  // Initialize the translation engine
  const translator = new Tstlai({
    targetLang: 'fr',
    provider: {
      type: 'custom' // Will use mock provider
    },
    cache: {
      type: 'memory',
      ttl: 3600 // 1 hour
    }
  });

  const html = `
    <div class="content">
      <h1>Hello World</h1>
      <p>This is a sample paragraph.</p>
    </div>
  `;

  try {
    const result = await translator.process(html);
    console.log('Original HTML:', html);
    console.log('Translated HTML:', result.html);
    console.log('Stats:', {
      translated: result.translatedCount,
      cached: result.cachedCount
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

run();