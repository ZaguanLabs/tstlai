# Security Considerations

tstlai is a translation library that integrates with AI providers. This guide covers security best practices for production deployments.

## Overview

tstlai itself does not enforce authentication or rate limiting—these are deployment concerns that vary by use case. This guide helps you implement appropriate protections.

## XSS Protection

### Built-in Protections

tstlai has inherent XSS protection in its core architecture:

- **Text node manipulation**: Translations are applied using `textContent`, not `innerHTML`, which automatically escapes HTML entities
- **Ignored tags**: `<script>`, `<style>`, `<code>`, `<pre>`, and `<textarea>` are never processed
- **Attribute safety**: Only text nodes are translated—HTML attributes remain untouched

### Best Practices

1. **Never use translations with `dangerouslySetInnerHTML`**

   ```tsx
   // ❌ Dangerous
   <div dangerouslySetInnerHTML={{ __html: translation }} />

   // ✅ Safe
   <div>{translation}</div>
   ```

2. **Use Content Security Policy headers**
   ```typescript
   // Next.js middleware or Express
   res.setHeader('Content-Security-Policy', "default-src 'self'");
   ```

## API Endpoint Protection

When using client-side translation (e.g., `AutoTranslate` component), you expose a public API endpoint. Without protection, attackers could:

- Use your AI credits for their own translations
- Run up your API costs
- Abuse your endpoint from their applications

> **⚠️ Important**: `createNextRouteHandler` provides no built-in authentication or rate limiting. You must wrap it with your own protections. An unprotected endpoint is trivially exploitable:
>
> ```bash
> curl -X POST https://yoursite.com/api/tstlai/translate \
>   -H "Content-Type: application/json" \
>   -d '{"targetLang": "es", "texts": ["Free translations!"]}'
> ```

### Recommended Protections

#### 1. Rate Limiting

Implement rate limiting to prevent abuse. Example with a simple in-memory limiter:

```typescript
// lib/rate-limit.ts
const ipCounts = new Map<string, { count: number; reset: number }>();

// Cleanup expired entries periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipCounts) {
    if (now >= record.reset) ipCounts.delete(ip);
  }
}, 60000);

export function rateLimit(
  ip: string,
  limit = 100,
  windowMs = 60000,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = ipCounts.get(ip);

  if (!record || now >= record.reset) {
    ipCounts.set(ip, { count: 1, reset: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: limit - record.count };
}
```

```typescript
// app/api/tstlai/translate/route.ts
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  // Note: x-forwarded-for can be spoofed if not behind a trusted proxy.
  // In production, only trust this header from your load balancer.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { allowed, remaining } = rateLimit(ip, 100, 60000);

  if (!allowed) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'X-RateLimit-Remaining': '0' },
    });
  }

  // ... handle translation
}
```

For production, consider using Redis-based rate limiting or services like Upstash.

#### 2. Origin Validation

Restrict API access to requests from your domain:

```typescript
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const allowedOrigins = ['https://yourdomain.com', 'https://www.yourdomain.com'];

  if (process.env.NODE_ENV === 'production') {
    if (!origin || !allowedOrigins.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  // ... handle translation
}
```

> **⚠️ Limitation**: Origin headers can be spoofed in server-to-server requests (e.g., `curl -H "Origin: https://yourdomain.com"`). This protects against casual browser-based abuse and raises the bar for attackers, but is not a security boundary. Always combine with rate limiting.

#### 3. Request Size Limits

Prevent large payload attacks:

```typescript
export async function POST(req: Request) {
  const body = await req.json();
  const { texts } = body;

  // Limit number of texts per request
  if (texts.length > 50) {
    return new Response('Too many texts in single request', { status: 400 });
  }

  // Limit total character count
  const totalChars = texts.reduce((sum: number, t: string) => sum + t.length, 0);
  if (totalChars > 50000) {
    return new Response('Request too large', { status: 400 });
  }

  // ... handle translation
}
```

#### 4. Session Tokens (Recommended)

Use dynamic, session-specific endpoints that are impossible to guess:

```typescript
// lib/session-token.ts
import 'server-only';
import { randomBytes } from 'crypto';

const sessionTokens = new Map<string, { createdAt: number; expiresAt: number }>();
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function generateSessionToken(): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  sessionTokens.set(token, { createdAt: now, expiresAt: now + TOKEN_TTL_MS });
  return token;
}

export function validateSessionToken(token: string): boolean {
  const session = sessionTokens.get(token);
  if (!session || Date.now() > session.expiresAt) {
    sessionTokens.delete(token);
    return false;
  }
  return true;
}
```

```typescript
// app/api/[sessionToken]/translate/route.ts
import { validateSessionToken } from '@/lib/session-token';

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ sessionToken: string }> },
) => {
  const { sessionToken } = await params;

  if (!validateSessionToken(sessionToken)) {
    return new Response('Invalid or expired session', { status: 401 });
  }

  // ... handle translation
};
```

```tsx
// In your layout (server component)
import { generateSessionToken } from '@/lib/session-token';

export default async function Layout({ children }) {
  const sessionToken = generateSessionToken();

  return (
    <>
      {children}
      <AutoTranslate
        endpoint={`/api/${sessionToken}/translate`}
        streamEndpoint={`/api/${sessionToken}/stream`}
      />
    </>
  );
}
```

This approach:

- ✅ Endpoints are cryptographically random (256 bits of entropy)
- ✅ Tokens expire after 24 hours
- ✅ Attackers cannot guess valid endpoints
- ✅ Each page render gets a unique token
- ⚠️ For multi-instance deployments, use Redis to share token state

#### 5. Authentication (Optional)

For sensitive deployments, require authentication:

```typescript
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const expectedToken = process.env.TSTLAI_API_TOKEN;

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // ... handle translation
}
```

#### 6. CSRF Protection (Cookie-Auth Only)

If your translation endpoint uses cookie-based authentication (e.g., session cookies), you should add CSRF protection:

```typescript
export async function POST(req: Request) {
  const csrfToken = req.headers.get('x-csrf-token');
  const expectedToken = cookies().get('csrf-token')?.value;

  if (!csrfToken || csrfToken !== expectedToken) {
    return new Response('Invalid CSRF token', { status: 403 });
  }

  // ... handle translation
}
```

> **Note**: CSRF is not needed if you use Bearer tokens or session tokens in the URL path, as these are not automatically sent by the browser like cookies are.

## Server-Side Only Mode

The most secure approach is to avoid exposing a public API entirely. Use `createPageTranslations` for server-side rendering:

```tsx
// This runs only on your server—no public endpoint needed
export default async function Page({ params }: { params: { locale: string } }) {
  const t = await createPageTranslations(translator, ['Welcome', 'About us', 'Contact']);

  return <h1>{t('Welcome')}</h1>;
}
```

This approach:

- ✅ No public API to abuse
- ✅ No client-side requests
- ✅ Better for SEO (pre-rendered content)
- ❌ Requires listing all strings upfront

## AI Provider Security

### API Key Protection

Never expose your AI provider API key:

```typescript
// ✅ Use environment variables
const provider = new OpenAIProvider(); // Reads from OPENAI_API_KEY

// ❌ Never hardcode
const provider = new OpenAIProvider('sk-abc123...');
```

### Cost Controls

Set up spending limits with your AI provider:

- **OpenAI**: Set monthly usage limits in your dashboard
- **Monitor usage**: Track API calls and costs
- **Alerts**: Configure billing alerts for unexpected spikes

## Cache Security

If using Redis for caching:

```typescript
// Use authentication
const cache = new RedisCache({
  url: process.env.REDIS_URL, // Include password in URL
  // or
  password: process.env.REDIS_PASSWORD,
});
```

- Use TLS connections in production
- Restrict network access to your Redis instance
- Consider cache key prefixing to avoid collisions

## Complete Protected Route Example

Here's a full implementation combining all protections:

```typescript
// app/api/tstlai/translate/route.ts
import { createNextRouteHandler } from 'tstlai/next';
import { getTranslator } from '@/lib/translator';
import { rateLimit } from '@/lib/rate-limit';

const ALLOWED_ORIGINS = ['https://yourdomain.com', 'https://www.yourdomain.com'];

export const POST = async (req: Request) => {
  // 1. Origin validation (raises the bar for abuse)
  if (process.env.NODE_ENV === 'production') {
    const origin = req.headers.get('origin');
    if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  // 2. Rate limiting
  // Note: x-forwarded-for can be spoofed if not behind a trusted proxy.
  // In production, only trust this header from your load balancer.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { allowed } = rateLimit(ip, 100, 60000);
  if (!allowed) {
    return new Response('Too Many Requests', { status: 429 });
  }

  // 3. Parse and validate request size
  const body = await req.json();
  const { texts, targetLang } = body;

  if (!texts || !Array.isArray(texts)) {
    return new Response('Invalid request', { status: 400 });
  }
  if (texts.length > 50) {
    return new Response('Too many texts', { status: 400 });
  }
  const totalChars = texts.reduce((sum: number, t: string) => sum + (t?.length || 0), 0);
  if (totalChars > 50000) {
    return new Response('Request too large', { status: 400 });
  }

  // 4. Handle translation
  const translator = getTranslator(targetLang || 'en');
  const handler = createNextRouteHandler(translator);

  const newReq = new Request(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(body),
  });

  return handler(newReq);
};
```

## Monitoring & Alerting

Protections alone aren't enough—you need visibility into abuse attempts:

1. **Log blocked requests** — Track 403s and 429s to identify attack patterns
2. **Monitor translation volume** — Alert on unusual spikes in API calls
3. **Track costs** — Set up billing alerts with your AI provider
4. **Review logs regularly** — Look for repeated failures from same IPs

```typescript
// Example: Log abuse attempts
if (!allowed) {
  console.warn(`[Rate limit] IP ${ip} exceeded limit`);
  return new Response('Too Many Requests', { status: 429 });
}
```

## Checklist

Before deploying to production:

- [ ] Rate limiting implemented on translation endpoints
- [ ] Origin validation for client-side translation
- [ ] Request size limits configured
- [ ] AI provider API key in environment variables
- [ ] Spending limits set with AI provider
- [ ] CSP headers configured
- [ ] Redis secured (if using Redis cache)
- [ ] Monitoring/alerting configured for abuse detection

## Reporting Security Issues

If you discover a security vulnerability in tstlai, please report it responsibly by emailing security@zaguanai.com rather than opening a public issue.
