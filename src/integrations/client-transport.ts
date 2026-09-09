export interface ClientRequestLimits {
  /** Match the route's maximum number of texts (default: 100). */
  maxTexts?: number;
  /** Match the route's total character limit (default: 100000). */
  maxTotalChars?: number;
}

interface TranslationRequest extends ClientRequestLimits {
  endpoint: string;
  texts: string[];
  targetLang?: string;
  signal: AbortSignal;
  onTranslation: (index: number, translation: string) => void;
}

/** Read complete SSE events, including events split across network chunks. */
async function* readEvents(response: Response, signal: AbortSignal): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Translation response has no body');
  const decoder = new TextDecoder();
  let buffer = '';
  let event: string[] = [];
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      // Normalize CRLF only after the LF arrives; preserve a split CR/LF pair.
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (!line) {
          if (event.length) yield event.join('\n');
          event = [];
        } else if (line.startsWith('data:')) {
          event.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (done) break;
    }
    // Require a terminated event; callers also require [DONE] and a complete index set.
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function requestTranslations({
  endpoint,
  texts,
  targetLang,
  signal,
  onTranslation,
  maxTexts = 100,
  maxTotalChars = 100000,
}: TranslationRequest): Promise<void> {
  if (
    !Number.isInteger(maxTexts) ||
    maxTexts <= 0 ||
    !Number.isInteger(maxTotalChars) ||
    maxTotalChars <= 0
  ) {
    throw new Error('Translation request limits must be positive integers');
  }
  const batches: Array<Array<{ index: number; text: string }>> = [];
  let batch: Array<{ index: number; text: string }> = [];
  let chars = 0;
  texts.forEach((text, index) => {
    if (text.length > maxTotalChars)
      throw new Error('A translation text exceeds the request character limit');
    if (batch.length && (batch.length >= maxTexts || chars + text.length > maxTotalChars)) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push({ index, text });
    chars += text.length;
  });
  if (batch.length) batches.push(batch);

  for (const items of batches) {
    signal.throwIfAborted();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: items.map((item) => item.text), targetLang }),
      signal,
    });
    signal.throwIfAborted();
    if (!response.ok) throw new Error(`Translation request failed (HTTP ${response.status})`);
    const seen = new Set<number>();
    const emit = (index: number, translation: string) => {
      signal.throwIfAborted();
      if (
        !Number.isInteger(index) ||
        !items[index] ||
        typeof translation !== 'string' ||
        seen.has(index)
      ) {
        throw new Error('Invalid translation index or value');
      }
      seen.add(index);
      onTranslation(items[index].index, translation);
    };
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      let complete = false;
      for await (const event of readEvents(response, signal)) {
        if (event === '[DONE]') {
          complete = true;
          break;
        }
        const data = JSON.parse(event);
        if (data.error) throw new Error('Translation failed');
        emit(data.index, data.translation);
      }
      if (!complete || seen.size !== items.length) throw new Error('Incomplete translation stream');
    } else {
      const data = await response.json();
      signal.throwIfAborted();
      if (
        !Array.isArray(data.translations) ||
        data.translations.length !== items.length ||
        data.translations.some((text: unknown) => typeof text !== 'string')
      ) {
        throw new Error('Invalid translation response');
      }
      if (data.error && !Array.isArray(data.failedIndices)) throw new Error('Translation failed');
      const failed = new Set<number>(data.failedIndices || []);
      data.translations.forEach((text: string, index: number) => {
        if (!failed.has(index)) emit(index, text);
      });
      if (data.error || failed.size) throw new Error('Translation failed');
    }
  }
}
