# CLI: Generate Translation Files

The `tstlai generate` command creates translation files from a source JSON file. This is perfect for:

- **Static sites** - Generate all translations at build time
- **Mobile apps** - Create language bundles for iOS/Android
- **CI/CD pipelines** - Automate translation updates
- **Cost optimization** - Translate once, use everywhere

## Quick Start

```bash
# Set your API key
export OPENAI_API_KEY=sk-...

# Generate Spanish and French translations
npx tstlai generate -i locales/en.json -o locales/ -l es,fr
```

This creates:

- `locales/es_ES.json`
- `locales/fr_FR.json`

## Command Reference

```
npx tstlai generate [options]

OPTIONS:
  -i, --input <file>       Source JSON file (required)
  -o, --output <dir>       Output directory (default: same as input)
  -l, --languages <list>   Target languages, comma-separated (required)
  -c, --context <text>     Translation context for better results
  -e, --exclude <terms>    Terms to keep untranslated
  --flat                   Output flat JSON structure
  --dry-run                Preview without API calls
  -v, --verbose            Show detailed output
  -h, --help               Show help
```

## Examples

### Basic Usage

```bash
# Single language
npx tstlai generate -i messages/en.json -l es

# Multiple languages
npx tstlai generate -i messages/en.json -l es,fr,de,ja,zh
```

### With Context (Recommended)

Providing context dramatically improves translation quality:

```bash
# E-commerce site
npx tstlai generate -i en.json -l es,fr \
  -c "E-commerce website selling outdoor gear"

# Developer documentation
npx tstlai generate -i en.json -l de,ja \
  -c "Technical documentation for a REST API"

# Mobile game
npx tstlai generate -i en.json -l ko,zh \
  -c "Casual puzzle game for mobile devices"
```

### Excluding Terms

Keep brand names, technical terms, or variables untranslated:

```bash
npx tstlai generate -i en.json -l es \
  -e "Acme Corp,ProductName,API,SDK"
```

### Preview Mode (Dry Run)

See what would be translated without making API calls:

```bash
npx tstlai generate -i en.json -l es,fr,de --dry-run
```

Output:

```
📄 Source: /path/to/en.json
📊 Found 45 translatable strings
🌍 Target languages: es, fr, de

🔍 DRY RUN - No API calls will be made

Would generate: /path/to/es_ES.json
  Language: Spanish (Spain)
  Strings: 45
Would generate: /path/to/fr_FR.json
  Language: French (France)
  Strings: 45
Would generate: /path/to/de_DE.json
  Language: German (Germany)
  Strings: 45

📈 Estimated API usage:
  Input tokens per language: ~1,250
  Total tokens (all languages): ~7,500
```

### Flat Output

Convert nested JSON to flat key-value pairs:

```bash
npx tstlai generate -i en.json -l es --flat
```

Input (`en.json`):

```json
{
  "common": {
    "welcome": "Welcome",
    "login": "Log in"
  }
}
```

Output (`es_ES.json`):

```json
{
  "common.welcome": "Bienvenido",
  "common.login": "Iniciar sesión"
}
```

## Contextual Strings (Disambiguation)

Single words can translate differently based on context. Use the `$t` / `$ctx` format to provide hints:

```json
{
  "actions": {
    "save": { "$t": "Save", "$ctx": "button: save file to disk" },
    "post": { "$t": "Post", "$ctx": "verb: publish content" },
    "file": { "$t": "File", "$ctx": "noun: menu item" },
    "match": { "$t": "Match", "$ctx": "noun: sports game" }
  }
}
```

### How It Works

| Source | Context           | Spanish      | Without Context        |
| ------ | ----------------- | ------------ | ---------------------- |
| Save   | button: save file | **Guardar**  | Ahorrar? Salvar?       |
| Post   | verb: publish     | **Publicar** | Correo? Poste?         |
| File   | noun: menu item   | **Archivo**  | Fila? Lima?            |
| Match  | noun: sports game | **Partido**  | Cerilla? Coincidencia? |

### Output Format

Contextual strings become **plain strings** in the output:

**Input** (`en.json`):

```json
{
  "save": { "$t": "Save", "$ctx": "button: save file" }
}
```

**Output** (`es_ES.json`):

```json
{
  "save": "Guardar"
}
```

### Best Practices

1. **Be specific** - "verb: publish content" is better than just "verb"
2. **Include UI context** - "button", "menu item", "page title", "error message"
3. **Mention domain** - "sports", "finance", "medical" when relevant
4. **Only when needed** - Don't add context to unambiguous phrases

## Input Format

The CLI accepts any valid JSON structure:

### Nested Objects

```json
{
  "pages": {
    "home": {
      "title": "Welcome Home",
      "description": "Your personal dashboard"
    }
  }
}
```

### Arrays

```json
{
  "features": ["Fast performance", "Easy to use", "Secure by default"]
}
```

### Mixed Content

```json
{
  "app": {
    "name": "MyApp",
    "taglines": ["Simple", "Powerful", "Free"],
    "stats": {
      "users": "Over 1 million users"
    }
  }
}
```

## Language Codes

You can use either short codes or full locale codes:

| Short | Full    | Language             |
| ----- | ------- | -------------------- |
| `es`  | `es_ES` | Spanish (Spain)      |
| `fr`  | `fr_FR` | French (France)      |
| `de`  | `de_DE` | German (Germany)     |
| `ja`  | `ja_JP` | Japanese             |
| `zh`  | `zh_CN` | Chinese (Simplified) |
| `pt`  | `pt_BR` | Portuguese (Brazil)  |

See [Supported Languages](../api/configuration.md#supported-languages) for the full list.

## CI/CD Integration

### GitHub Actions

```yaml
name: Generate Translations

on:
  push:
    paths:
      - 'locales/en.json'

jobs:
  translate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Generate translations
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx tstlai generate \
            -i locales/en.json \
            -o locales/ \
            -l es,fr,de,ja \
            -c "SaaS application for project management"

      - name: Commit translations
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add locales/
          git commit -m "chore: update translations" || exit 0
          git push
```

### GitLab CI

```yaml
translate:
  stage: build
  image: node:20
  script:
    - npx tstlai generate -i locales/en.json -o locales/ -l es,fr,de
  only:
    changes:
      - locales/en.json
  artifacts:
    paths:
      - locales/
```

## Cost Estimation

The CLI shows estimated token usage in dry-run mode. Actual costs depend on your OpenAI model:

| Model         | Input (1M tokens) | Output (1M tokens) |
| ------------- | ----------------- | ------------------ |
| gpt-4o-mini   | $0.15             | $0.60              |
| gpt-4o        | $2.50             | $10.00             |
| gpt-3.5-turbo | $0.50             | $1.50              |

**Example**: 100 strings (~2,500 tokens) × 5 languages = ~25,000 total tokens

- gpt-4o-mini: ~$0.02
- gpt-4o: ~$0.31

## Environment Variables

| Variable          | Description         | Default                     |
| ----------------- | ------------------- | --------------------------- |
| `OPENAI_API_KEY`  | Your OpenAI API key | Required                    |
| `OPENAI_MODEL`    | Model to use        | `gpt-4o-mini`               |
| `OPENAI_BASE_URL` | Custom API endpoint | `https://api.openai.com/v1` |

## Tips

1. **Start with dry-run** - Always preview before translating
2. **Use context** - Better context = better translations
3. **Exclude brands** - Keep product names consistent
4. **Review Tier 3 languages** - Functional languages may need human review
5. **Version control** - Commit translations alongside source
