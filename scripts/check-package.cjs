// Exercise the tarball in an isolated consumer, rather than resolving workspace source files.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tstlai-package-'));
const repository = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args, cwd = directory) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_PATH: '', HUSKY: '0' },
  });
const check = (source, esm = false) =>
  run(process.execPath, [...(esm ? ['--input-type=module'] : []), '-e', source]);
try {
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'tstlai-consumer-check', private: true }),
  );
  const packOutput = run(
    npm,
    ['pack', '--json', '--ignore-scripts', '--pack-destination', directory],
    repository,
  );
  // npm 10 runs prepare despite --ignore-scripts, and Husky writes its skip
  // notice without a newline. The packing report is the following JSON array.
  const [packed] = JSON.parse(packOutput.slice(packOutput.indexOf('[')));
  const metadata = require('../package.json');
  const files = new Set(packed.files.map((file) => file.path));
  for (const target of Object.values(metadata.exports)) {
    for (const file of typeof target === 'string' ? [target] : Object.values(target)) {
      assert(files.has(file.replace(/^\.\//, '')), `Missing export target: ${file}`);
    }
  }
  assert(files.has(metadata.bin.tstlai.replace(/^\.\//, '')), 'CLI executable missing');
  assert(
    [...files].every(
      (file) => file.startsWith('dist/') || ['package.json', 'README.md', 'LICENSE'].includes(file),
    ),
    'Unexpected file in package',
  );
  run(npm, [
    'install',
    '--ignore-scripts',
    '--omit=dev',
    '--omit=optional',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    path.join(directory, packed.filename),
  ]);
  const serverCheck = `
    const assert = require('node:assert/strict');
    assert.throws(() => require.resolve('react'), { code: 'MODULE_NOT_FOUND' });
    const { Tstlai, integrations } = require('tstlai');
    for (const entry of ['server', 'express', 'fastify', 'astro', 'remix', 'languages', 'integrations/next-intl']) require('tstlai/' + entry);
    const cli = require('tstlai/cli');
    assert.equal(typeof cli.generateTranslations, 'function');
    assert.equal(typeof integrations.createExpressMiddleware, 'function');
    const t = new Tstlai({ targetLang: 'nb', provider: {
      translate: async texts => texts.map(() => 'Hei'),
      getModelInfo: () => ({ name: 'consumer-fixture', capabilities: [] }),
    }});
    t.process('<p>Hello</p>').then(async result => {
      assert.equal(result.html, '<p>Hei</p>');
      await t.close();
      console.log('server-ok');
    }).catch(error => { console.error(error); process.exitCode = 1; });
  `;
  assert(check(serverCheck).includes('server-ok'), 'CLI import exited before consumer ran');
  assert(
    check(
      `
    import { Tstlai } from 'tstlai';
    import { createNextRouteHandler } from 'tstlai/server';
    import { generateTranslations } from 'tstlai/cli';
    import assert from 'node:assert/strict';
    assert.equal(typeof Tstlai, 'function');
    assert.equal(typeof createNextRouteHandler, 'function');
    assert.equal(typeof generateTranslations, 'function');
    console.log('esm-ok');
  `,
      true,
    ).includes('esm-ok'),
  );
  const help = run(process.execPath, [
    path.join(directory, 'node_modules/tstlai/dist/cli/index.js'),
    '--help',
  ]);
  assert(help.includes('USAGE:') && help.includes('gpt-5.2-mini'), 'CLI help failed');

  // Compile the shipped declarations without any React types in the consumer.
  fs.writeFileSync(
    path.join(directory, 'consumer.ts'),
    `
    import { Tstlai, type AIProvider, type TranslationCache } from 'tstlai';
    import { createNextRouteHandler } from 'tstlai/server';
    import { generateTranslations, type GenerateOptions } from 'tstlai/cli';
    const provider: AIProvider = { translate: async texts => texts, getModelInfo: () => ({ name: 'test', capabilities: [] }) };
    const cache: TranslationCache = { get: async () => null, set: async () => {} };
    const translator = new Tstlai({ targetLang: 'nb', provider, cache });
    createNextRouteHandler(translator);
    const options: GenerateOptions = { inputFile: 'source.json', languages: ['nb'], dryRun: true };
    void generateTranslations(options);
    void translator.close();
  `,
  );
  fs.writeFileSync(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        strict: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2022',
        lib: ['ES2022', 'DOM'],
        types: [],
      },
      files: ['consumer.ts'],
    }),
  );
  run(process.execPath, [
    require.resolve('typescript/bin/tsc'),
    '--project',
    path.join(directory, 'tsconfig.json'),
  ]);

  const reactVersion = process.env.REACT_VERSION || require('react/package.json').version;
  run(npm, [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    '--no-save',
    `react@${reactVersion}`,
    `react-dom@${reactVersion}`,
  ]);
  check(String.raw`
    const assert = require('node:assert/strict');
    const React = require('react');
    const { renderToString } = require('react-dom/server');
    const client = require('tstlai/client');
    assert(!Object.keys(require.cache).some(file => /node_modules\/(openai|ioredis|node-html-parser)\//.test(file)), 'Client entry loaded server dependencies');
    const rendered = renderToString(React.createElement(client.TstlaiProvider, { locale: 'nb', initialMessages: {} }, React.createElement('span', null, 'Hei')));
    assert.equal(rendered, '<span>Hei</span>');
    assert.equal(require('tstlai').integrations.AutoTranslate, client.AutoTranslate);
    assert.equal(require('tstlai/integrations').AutoTranslate, client.AutoTranslate);
    assert.equal(require('tstlai/next').AutoTranslate, client.AutoTranslate);
    assert.equal(renderToString(React.createElement(client.AutoTranslate)), '');
  `);
  console.log(
    `Package checks passed: React-free server imports, CJS/ESM consumers, CLI, declarations, React ${reactVersion}.`,
  );
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
