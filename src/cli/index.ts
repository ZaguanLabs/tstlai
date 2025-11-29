#!/usr/bin/env node
/**
 * tstlai CLI - Generate translation files from a source JSON
 *
 * Usage:
 *   npx tstlai generate -i messages/en.json -o messages/ -l es,fr,de,ja
 *   npx tstlai generate --input locales/en.json --output locales/ --languages es_ES,fr_FR
 */

import { parseArgs } from 'node:util';
import { generateTranslations, GenerateOptions } from './generate';

const HELP_TEXT = `
tstlai - AI-powered translation file generator

USAGE:
  npx tstlai generate [options]

COMMANDS:
  generate    Generate translation files from a source JSON file

OPTIONS:
  -i, --input <file>       Source JSON file (required)
  -o, --output <dir>       Output directory for generated files (default: same as input)
  -l, --languages <list>   Comma-separated list of target languages (required)
                           Examples: es,fr,de or es_ES,fr_FR,de_DE
  -c, --context <text>     Translation context (e.g., "e-commerce website")
  -e, --exclude <terms>    Comma-separated terms to exclude from translation
  --flat                   Output flat JSON (no nested structure)
  --dry-run                Show what would be translated without calling the API
  -v, --verbose            Enable verbose output
  -h, --help               Show this help message

ENVIRONMENT VARIABLES:
  OPENAI_API_KEY           OpenAI API key (required)
  OPENAI_MODEL             Model to use (default: gpt-4o-mini)
  OPENAI_BASE_URL          Custom API base URL

EXAMPLES:
  # Generate Spanish and French translations
  npx tstlai generate -i locales/en.json -o locales/ -l es,fr

  # Generate with context for better translations
  npx tstlai generate -i messages.json -l de,ja -c "SaaS dashboard for developers"

  # Exclude brand names from translation
  npx tstlai generate -i en.json -l es -e "Acme Corp,ProductName"

  # Preview what would be translated
  npx tstlai generate -i en.json -l es --dry-run
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: 'string', short: 'i' },
      output: { type: 'string', short: 'o' },
      languages: { type: 'string', short: 'l' },
      context: { type: 'string', short: 'c' },
      exclude: { type: 'string', short: 'e' },
      flat: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  // Show help
  if (values.help || positionals.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const command = positionals[0];

  if (command !== 'generate') {
    console.error(`Unknown command: ${command}`);
    console.log(HELP_TEXT);
    process.exit(1);
  }

  // Validate required options
  if (!values.input) {
    console.error('Error: --input (-i) is required');
    process.exit(1);
  }

  if (!values.languages) {
    console.error('Error: --languages (-l) is required');
    process.exit(1);
  }

  // Check for API key
  if (!process.env.OPENAI_API_KEY && !values['dry-run']) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    console.error('Set it with: export OPENAI_API_KEY=your-api-key');
    process.exit(1);
  }

  const options: GenerateOptions = {
    inputFile: values.input,
    outputDir: values.output,
    languages: values.languages.split(',').map((l) => l.trim()),
    context: values.context,
    excludedTerms: values.exclude?.split(',').map((t) => t.trim()),
    flatOutput: values.flat,
    dryRun: values['dry-run'],
    verbose: values.verbose,
  };

  try {
    await generateTranslations(options);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
