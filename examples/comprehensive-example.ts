// Comprehensive example of Tstlai usage

import { Tstlai, TranslationConfig } from '../src';

async function runExample() {
  console.log('=== Tstlai Translation Engine Example ===\n');

  // Example 1: Using the placeholder provider
  console.log('1. Initializing Engine...');
  const config: TranslationConfig = {
    targetLang: 'es',
    provider: {
      type: 'custom'
    },
    cache: {
      type: 'memory',
      ttl: 60
    }
  };

  const translator = new Tstlai(config);
  
  // Example 2: Processing a full HTML page
  console.log('2. Processing HTML page...');
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Example Page</title></head>
      <body>
        <header>
          <h1>Welcome User</h1>
        </header>
        <main>
          <p>This is a paragraph needing translation.</p>
          <button data-no-translate>Save</button>
        </main>
      </body>
    </html>
  `;

  const result = await translator.process(html);
  console.log('Original Length:', html.length);
  console.log('Translated Length:', result.html.length);
  console.log('Translated HTML Snippet:', result.html.substring(0, 200) + '...');
  console.log('Stats:', {
    translated: result.translatedCount,
    cached: result.cachedCount
  });

  // Example 3: Demonstrating Cache Hit
  console.log('\n3. Demonstrating Cache Hit...');
  const result2 = await translator.process(html);
  console.log('Stats (Second Run):', {
    translated: result2.translatedCount,
    cached: result2.cachedCount
  });

  if (result2.cachedCount > 0 && result2.translatedCount === 0) {
    console.log('SUCCESS: Cache hit confirmed.');
  }
}

// Run the example
runExample().catch(console.error);