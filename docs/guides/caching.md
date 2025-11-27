# Caching Strategies

tstlai relies heavily on caching to ensure production performance and minimize AI costs.

## Memory Cache (Default)

By default, tstlai uses an in-memory cache (`Map`). This is suitable for development or serverless functions with short lifespans, but not recommended for production scaling.

```typescript
const translator = new Tstlai({
  // ...
  cache: {
    type: 'memory',
    ttl: 3600 // 1 hour
  }
});
```

## Redis Cache (Recommended)

For production, use Redis. This allows translations to persist across deployments and be shared between multiple server instances.

### Configuration

```typescript
const translator = new Tstlai({
  // ...
  cache: {
    type: 'redis',
    // Connection String (supports redis:// and redis+socket://)
    connectionString: process.env.REDIS_URL,
    
    // Time to Live (in seconds)
    ttl: 60 * 60 * 24 * 7, // 7 days recommended
    
    // Namespace (optional)
    keyPrefix: 'tstlai:' 
  }
});
```

### Key Structure

tstlai uses a **Composite Key** strategy to support multiple languages safely.

Format: `{keyPrefix}{contentHash}:{targetLangCode}`

Example for "Hello" (SHA-256 hash `185f...`):
- **Spanish**: `tstlai:185f...:es` -> "Hola"
- **French**: `tstlai:185f...:fr` -> "Bonjour"

This ensures that translations never collide between languages.

### Cache Warming

Because cache keys are deterministic based on content, you can pre-warm the cache by running a script that iterates through your known content (e.g., `en.json`) and calls `translator.translateText()` for each target language.
