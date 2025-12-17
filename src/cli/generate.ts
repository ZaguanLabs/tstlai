/**
 * Core translation generation logic for the CLI
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { OpenAIProvider } from '../providers/OpenAIProvider';
import { normalizeLocaleCode, isLanguageSupported, getLanguageInfo } from '../languages';
import type { TranslationStyle } from '../types';

export interface GenerateOptions {
  inputFile: string;
  outputDir?: string;
  languages: string[];
  context?: string;
  excludedTerms?: string[];
  glossary?: Record<string, string>;
  style?: TranslationStyle;
  flatOutput?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

interface TranslationStats {
  language: string;
  totalStrings: number;
  translatedStrings: number;
  cachedStrings: number;
  outputFile: string;
  duration: number;
}

type JsonValue = string | number | boolean | null | JsonObject | JsonArray | ContextualString;
interface JsonObject {
  [key: string]: JsonValue;
}
type JsonArray = JsonValue[];

/**
 * Contextual string format for disambiguation.
 * Use this when a word/phrase needs context for accurate translation.
 *
 * Example:
 * {
 *   "save": { "$t": "Save", "$ctx": "button: save file to disk" },
 *   "post": { "$t": "Post", "$ctx": "verb: publish content" },
 *   "match": { "$t": "Match", "$ctx": "noun: sports game" }
 * }
 */
export interface ContextualString {
  /** The text to translate */
  $t: string;
  /** Context hint for the translator (not included in output) */
  $ctx: string;
}

/**
 * Check if a value is a contextual string object
 */
function isContextualString(value: unknown): value is ContextualString {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$t' in value &&
    '$ctx' in value &&
    typeof (value as ContextualString).$t === 'string' &&
    typeof (value as ContextualString).$ctx === 'string'
  );
}

/**
 * Extracted string with optional context
 */
interface ExtractedString {
  text: string;
  context?: string;
}

/**
 * Extract all translatable strings from a JSON object
 * Returns a map of dot-notation paths to extracted strings (with optional context)
 */
function extractStrings(obj: JsonValue, prefix = ''): Map<string, ExtractedString> {
  const strings = new Map<string, ExtractedString>();

  if (typeof obj === 'string') {
    strings.set(prefix, { text: obj });
  } else if (isContextualString(obj)) {
    // Handle contextual string: { "$t": "Save", "$ctx": "button" }
    strings.set(prefix, { text: obj.$t, context: obj.$ctx });
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const itemStrings = extractStrings(item, prefix ? `${prefix}[${index}]` : `[${index}]`);
      itemStrings.forEach((v, k) => strings.set(k, v));
    });
  } else if (obj !== null && typeof obj === 'object') {
    Object.entries(obj).forEach(([key, value]) => {
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      const childStrings = extractStrings(value, newPrefix);
      childStrings.forEach((v, k) => strings.set(k, v));
    });
  }

  return strings;
}

/**
 * Reconstruct a JSON object from translated strings.
 * Contextual strings are converted back to plain strings in output.
 */
function reconstructJson(
  original: JsonValue,
  translations: Map<string, string>,
  prefix = '',
): JsonValue {
  if (typeof original === 'string') {
    return translations.get(prefix) || original;
  }

  // Contextual strings become plain strings in output
  if (isContextualString(original)) {
    return translations.get(prefix) || original.$t;
  }

  if (Array.isArray(original)) {
    return original.map((item, index) => {
      const itemPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      return reconstructJson(item, translations, itemPrefix);
    });
  }

  if (original !== null && typeof original === 'object') {
    const result: JsonObject = {};
    Object.entries(original).forEach(([key, value]) => {
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      result[key] = reconstructJson(value, translations, newPrefix);
    });
    return result;
  }

  return original;
}

/**
 * Create a flat JSON object from translations
 */
function createFlatJson(translations: Map<string, string>): JsonObject {
  const result: JsonObject = {};
  translations.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Progress bar helper
 */
function progressBar(current: number, total: number, width = 30): string {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
}

/**
 * Main generation function
 */
export async function generateTranslations(options: GenerateOptions): Promise<TranslationStats[]> {
  const {
    inputFile,
    outputDir,
    languages,
    context,
    excludedTerms,
    glossary,
    style,
    flatOutput,
    dryRun,
    verbose,
  } = options;

  // Resolve paths
  const inputPath = path.resolve(inputFile);
  const outputPath = outputDir ? path.resolve(outputDir) : path.dirname(inputPath);

  // Validate input file
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Read and parse source JSON
  const sourceContent = fs.readFileSync(inputPath, 'utf-8');
  let sourceJson: JsonValue;
  try {
    sourceJson = JSON.parse(sourceContent);
  } catch {
    throw new Error(`Invalid JSON in input file: ${inputPath}`);
  }

  // Extract strings
  const strings = extractStrings(sourceJson);
  const stringEntries = Array.from(strings.entries());

  console.log(`\n📄 Source: ${inputPath}`);
  console.log(`📊 Found ${strings.size} translatable strings`);
  console.log(`🌍 Target languages: ${languages.join(', ')}`);

  // Count strings with context hints
  const stringsWithContext = stringEntries.filter(([, v]) => v.context).length;
  if (stringsWithContext > 0) {
    console.log(`💡 ${stringsWithContext} strings have context hints`);
  }

  if (verbose) {
    console.log('\nStrings to translate:');
    stringEntries.slice(0, 5).forEach(([key, { text, context: ctx }]) => {
      const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
      const ctxHint = ctx ? ` [ctx: ${ctx}]` : '';
      console.log(`  ${key}: "${preview}"${ctxHint}`);
    });
    if (stringEntries.length > 5) {
      console.log(`  ... and ${stringEntries.length - 5} more`);
    }
  }

  // Validate languages
  const normalizedLanguages = languages.map((lang) => {
    const normalized = normalizeLocaleCode(lang);
    if (!isLanguageSupported(normalized)) {
      console.warn(`⚠️  Warning: "${lang}" may not be fully supported`);
    }
    return normalized;
  });

  // Dry run - just show what would happen
  if (dryRun) {
    console.log('\n🔍 DRY RUN - No API calls will be made\n');

    normalizedLanguages.forEach((lang) => {
      const info = getLanguageInfo(lang);
      const langName = info ? `${info.language} (${info.region})` : lang;
      const outputFile = path.join(outputPath, `${lang}.json`);
      console.log(`Would generate: ${outputFile}`);
      console.log(`  Language: ${langName}`);
      console.log(`  Strings: ${strings.size}`);
    });

    // Estimate tokens (rough approximation)
    const totalChars = stringEntries.reduce((sum, [, v]) => sum + v.text.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4); // ~4 chars per token
    const totalTokens = estimatedTokens * normalizedLanguages.length * 2; // input + output

    console.log(`\n📈 Estimated API usage:`);
    console.log(`  Input tokens per language: ~${estimatedTokens.toLocaleString()}`);
    console.log(`  Total tokens (all languages): ~${totalTokens.toLocaleString()}`);

    return [];
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  // Initialize provider
  const provider = new OpenAIProvider();
  const stats: TranslationStats[] = [];

  console.log('\n🚀 Starting translation...\n');

  // Process each language
  for (const targetLang of normalizedLanguages) {
    const startTime = Date.now();
    const info = getLanguageInfo(targetLang);
    const langName = info ? `${info.language} (${info.region})` : targetLang;

    process.stdout.write(`${langName}: ${progressBar(0, strings.size)}`);

    // Prepare texts for translation
    // Format: include context hints inline for the AI to use
    const textsToTranslate = stringEntries.map(([, { text, context: ctx }]) => {
      if (ctx) {
        // Include context as a hint the AI will see but strip from output
        return `${text} {{__ctx__:${ctx}}}`;
      }
      return text;
    });

    // Hash for potential caching (reserved for future use)
    void stringEntries.map(([, { text }]) =>
      crypto.createHash('sha256').update(text.trim()).digest('hex'),
    );

    try {
      // Translate in batches to avoid token limits
      const BATCH_SIZE = 50;
      const translatedTexts: string[] = [];

      for (let i = 0; i < textsToTranslate.length; i += BATCH_SIZE) {
        const batch = textsToTranslate.slice(i, i + BATCH_SIZE);
        const batchTranslations = await provider.translate(
          batch,
          targetLang,
          excludedTerms,
          context,
          glossary,
          style,
        );
        translatedTexts.push(...batchTranslations);

        // Update progress
        const progress = Math.min(i + BATCH_SIZE, textsToTranslate.length);
        process.stdout.write(`\r${langName}: ${progressBar(progress, strings.size)}`);
      }

      // Build translation map (strip any remaining context markers)
      const translationMap = new Map<string, string>();
      stringEntries.forEach(([key, { text: originalText }], index) => {
        let translated = translatedTexts[index] || originalText;
        // Remove any context markers that might have leaked through
        translated = translated.replace(/\s*\{\{__ctx__:[^}]+\}\}\s*/g, '');
        translationMap.set(key, translated);
      });

      // Generate output JSON
      let outputJson: JsonValue;
      if (flatOutput) {
        outputJson = createFlatJson(translationMap);
      } else {
        outputJson = reconstructJson(sourceJson, translationMap);
      }

      // Write output file
      const outputFile = path.join(outputPath, `${targetLang}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(outputJson, null, 2), 'utf-8');

      const duration = Date.now() - startTime;
      process.stdout.write(
        `\r${langName}: ${progressBar(strings.size, strings.size)} ✓ (${(duration / 1000).toFixed(1)}s)\n`,
      );

      stats.push({
        language: targetLang,
        totalStrings: strings.size,
        translatedStrings: translatedTexts.length,
        cachedStrings: 0, // CLI doesn't use cache currently
        outputFile,
        duration,
      });
    } catch (error) {
      process.stdout.write(`\r${langName}: ${progressBar(0, strings.size)} ✗ Error\n`);
      console.error(
        `  Error translating to ${langName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // Summary
  console.log('\n📋 Summary:');
  stats.forEach((stat) => {
    console.log(`  ✓ ${stat.language}: ${stat.translatedStrings} strings → ${stat.outputFile}`);
  });

  const totalDuration = stats.reduce((sum, s) => sum + s.duration, 0);
  console.log(`\n⏱️  Total time: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log('✨ Done!\n');

  return stats;
}
