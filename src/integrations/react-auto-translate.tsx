'use client';

import { useEffect, useRef } from 'react';

interface AutoTranslateProps {
  /** API endpoint for translations (default: /api/tstlai/translate) */
  endpoint?: string;
  /** Streaming API endpoint (default: /api/tstlai/stream) */
  streamEndpoint?: string;
  /** Target language code */
  targetLang?: string;
  /** Enable streaming mode for progressive translation updates */
  stream?: boolean;
  /** Buffer time in ms before first stream update (default: 1500) */
  streamBuffer?: number;
  /** HTML tags to ignore */
  ignoredTags?: string[];
  /** CSS classes to ignore */
  ignoredClasses?: string[];
}

export const AutoTranslate = ({
  endpoint = '/api/tstlai/translate',
  streamEndpoint = '/api/tstlai/stream',
  targetLang,
  stream = false,
  streamBuffer = 1500,
  ignoredTags = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT'],
  ignoredClasses = ['notranslate'],
}: AutoTranslateProps) => {
  const processingRef = useRef(new Set<Node>());
  const observerRef = useRef<MutationObserver | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const collectTextNodes = (): { node: Node; text: string }[] => {
      const textNodes: { node: Node; text: string }[] = [];

      const walk = (node: Node) => {
        if (processingRef.current.has(node)) return;

        // Element Check
        if (node.nodeType === 1) {
          const el = node as HTMLElement;
          if (ignoredTags.includes(el.tagName)) return;
          if (el.getAttribute('data-no-translate')) return;
          if (ignoredClasses.some((cls) => el.classList.contains(cls))) return;
        }

        // Text Node Check
        if (node.nodeType === 3) {
          const text = node.textContent?.trim();
          if (text && text.length > 1 && !/^\d+$/.test(text)) {
            textNodes.push({ node, text });
            processingRef.current.add(node);
          }
        }

        node.childNodes.forEach(walk);
      };

      walk(document.body);
      return textNodes;
    };

    const translateBatch = async (textNodes: { node: Node; text: string }[]) => {
      if (textNodes.length === 0) return;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: textNodes.map((t) => t.text),
            targetLang,
          }),
        });

        const data = await response.json();

        textNodes.forEach((item, index) => {
          if (data.translations && data.translations[index]) {
            item.node.textContent = data.translations[index];
          }
        });
      } catch (err) {
        console.error('[Tstlai] Auto-translation failed:', err);
      }
    };

    const translateStream = async (textNodes: { node: Node; text: string }[]) => {
      if (textNodes.length === 0) return;

      try {
        const response = await fetch(streamEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: textNodes.map((t) => t.text),
            targetLang,
          }),
        });

        // Check if we got a streaming response
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('text/event-stream')) {
          // Fallback: treat as batch response
          const data = await response.json();
          textNodes.forEach((item, index) => {
            if (data.translations && data.translations[index]) {
              item.node.textContent = data.translations[index];
            }
          });
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = '';
        const pendingUpdates: { index: number; translation: string }[] = [];
        let bufferTimeout: NodeJS.Timeout | null = null;
        let firstUpdateSent = false;

        const applyPendingUpdates = () => {
          pendingUpdates.forEach(({ index, translation }) => {
            if (textNodes[index]) {
              textNodes[index].node.textContent = translation;
            }
          });
          pendingUpdates.length = 0;
          firstUpdateSent = true;
        };

        // Start buffer timer
        bufferTimeout = setTimeout(() => {
          applyPendingUpdates();
        }, streamBuffer);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.index !== undefined && parsed.translation) {
                  if (firstUpdateSent) {
                    // After buffer period, apply immediately
                    if (textNodes[parsed.index]) {
                      textNodes[parsed.index].node.textContent = parsed.translation;
                    }
                  } else {
                    // During buffer period, queue updates
                    pendingUpdates.push(parsed);
                  }
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        // Apply any remaining buffered updates
        if (bufferTimeout) {
          clearTimeout(bufferTimeout);
        }
        applyPendingUpdates();
      } catch (err) {
        console.error('[Tstlai] Streaming translation failed:', err);
      }
    };

    const scanAndTranslate = async () => {
      const textNodes = collectTextNodes();
      if (stream) {
        await translateStream(textNodes);
      } else {
        await translateBatch(textNodes);
      }
    };

    // Initial Scan
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(scanAndTranslate);
    } else {
      setTimeout(scanAndTranslate, 100);
    }

    // Observe for new content (Suspense/Navigation) with debounce
    observerRef.current = new MutationObserver(() => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(scanAndTranslate, 500);
    });

    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observerRef.current?.disconnect();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [endpoint, streamEndpoint, targetLang, stream, streamBuffer, ignoredTags, ignoredClasses]);

  return null; // Renderless component
};
