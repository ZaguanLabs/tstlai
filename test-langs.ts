import { Tstlai } from './src';

async function testLanguages() {
  const translator = new Tstlai({
    targetLang: 'ar_SA',
    provider: { type: 'custom' },
    cache: { type: 'memory' }
  });

  const html = '<html><body><h1>Test</h1></body></html>';
  const result = await translator.process(html);
  
  if (result.html.includes('dir="rtl"')) {
    console.log('RTL check passed for ar_SA');
  } else {
    console.error('RTL check failed for ar_SA');
  }
}

testLanguages();
