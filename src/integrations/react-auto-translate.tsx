'use client';

import { useEffect, useRef } from 'react';
import { requestTranslations, type ClientRequestLimits } from './client-transport';
import { preserveWhitespace } from '../core/text';

export interface AutoTranslateProps extends ClientRequestLimits {
  /** Automatic retries after failed requests (default: 2). */
  maxRetries?: number;
  onError?: (error: Error) => void;
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

/**
 * Strip context markers from text.
 * Supports both formats:
 * - "Text$ctx:context_hint" (inline suffix)
 * - "Text {{__ctx__:context hint}}" (template format)
 */
function stripContextMarkers(text: string): string {
  return text
    .replace(/\$ctx:[^\s]*/g, '') // Strip $ctx:suffix format
    .replace(/\s*\{\{__ctx__:[^}]+\}\}\s*/g, '') // Strip {{__ctx__:...}} format
    .trim();
}

/**
 * Extract context from text for sending to API.
 * Returns { text, context } where context is undefined if none found.
 */
function extractContext(text: string): { text: string; context?: string } {
  // Check for $ctx:suffix format
  const suffixMatch = text.match(/\$ctx:([^\s]+)/);
  if (suffixMatch) {
    return {
      text: text.replace(/\$ctx:[^\s]*/g, '').trim(),
      context: suffixMatch[1].replace(/_/g, ' '),
    };
  }

  // Check for {{__ctx__:...}} format
  const templateMatch = text.match(/\{\{__ctx__:([^}]+)\}\}/);
  if (templateMatch) {
    return {
      text: text.replace(/\s*\{\{__ctx__:[^}]+\}\}\s*/g, '').trim(),
      context: templateMatch[1],
    };
  }

  return { text };
}

const DEFAULT_IGNORED_TAGS = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT'];
const DEFAULT_IGNORED_CLASSES = ['notranslate'];
interface NodeTranslation {
  source: string;
  rendered: string;
  locale?: string;
  attempts: number;
  requestedLocale?: string;
  pending?: object;
}

export const AutoTranslate = ({
  endpoint = '/api/tstlai/translate',
  streamEndpoint = '/api/tstlai/stream',
  targetLang,
  stream = false,
  streamBuffer = 1500,
  ignoredTags = DEFAULT_IGNORED_TAGS,
  ignoredClasses = DEFAULT_IGNORED_CLASSES,
  maxTexts = 100,
  maxTotalChars = 100000,
  maxRetries = 2,
  onError,
}: AutoTranslateProps) => {
  const recordsRef = useRef(new WeakMap<Node, NodeTranslation>());

  useEffect(() => {
    const abort = new AbortController();
    const locale = targetLang || '';
    const token = {};
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;
    let running = false;
    let rescan = false;
    const dirtyRoots = new Set<Node>([document.body]);
    const schedule = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
      return timer;
    };
    const ignored = (element: Element) =>
      ignoredTags.includes(element.tagName) ||
      element.hasAttribute('data-no-translate') ||
      element.getAttribute('translate') === 'no' ||
      ignoredClasses.some((cls) => element.classList.contains(cls));
    const collect = () => {
      const items: Array<{ node: Node; record: NodeTranslation; source: string; text: string }> =
        [];
      const walk = (node: Node) => {
        if (node.nodeType === 1 && ignored(node as Element)) return;
        if (node.nodeType === 3) {
          const current = node.textContent || '';
          let record = recordsRef.current.get(node);
          // Framework updates replace the original source; our own writes keep it intact.
          if (!record || current !== record.rendered) {
            record = { source: current, rendered: current, attempts: 0 };
            recordsRef.current.set(node, record);
          }
          if (record.locale !== locale && record.pending !== token) {
            if (record.requestedLocale !== locale) {
              record.attempts = 0;
              record.requestedLocale = locale;
              record.rendered = preserveWhitespace(
                record.source,
                stripContextMarkers(record.source),
              );
              node.textContent = record.rendered;
            }
            if (
              record.attempts <= maxRetries &&
              record.source.trim().length > 1 &&
              !/^\d+$/.test(record.source.trim())
            ) {
              const { text, context } = extractContext(record.source.trim());
              record.pending = token;
              items.push({
                node,
                record,
                source: record.source,
                text: context ? `${text} {{__ctx__:${context}}}` : text,
              });
            }
          }
        }
        node.childNodes.forEach(walk);
      };
      // Mutations identify the affected subtrees. Only the initial/locale scan visits the body.
      for (const root of dirtyRoots) {
        if (!root.isConnected) continue;
        let parent = root.parentElement;
        let skip = false;
        while (parent) {
          if (dirtyRoots.has(parent) || ignored(parent)) {
            skip = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (!skip) walk(root);
      }
      dirtyRoots.clear();
      return items;
    };
    const scan = async () => {
      if (abort.signal.aborted) return;
      if (running) {
        rescan = true;
        return;
      }
      running = true;
      const items = collect();
      const updates = new Map<number, string>();
      let firstUpdate = !stream;
      const apply = () => {
        if (abort.signal.aborted) return;
        for (const [index, translation] of updates) {
          const item = items[index];
          if (
            !item.node.isConnected ||
            recordsRef.current.get(item.node) !== item.record ||
            (item.node.textContent !== item.record.rendered &&
              item.node.textContent !== item.source)
          )
            continue;
          const result = preserveWhitespace(item.source, stripContextMarkers(translation));
          item.record.rendered = result;
          item.node.textContent = result;
        }
        updates.clear();
        firstUpdate = true;
      };
      let bufferTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (!items.length) return;
        if (stream) bufferTimer = schedule(apply, streamBuffer);
        await requestTranslations({
          endpoint: stream ? streamEndpoint : endpoint,
          texts: items.map((item) => item.text),
          targetLang,
          signal: abort.signal,
          maxTexts,
          maxTotalChars,
          onTranslation(index, translation) {
            updates.set(index, translation);
            if (firstUpdate) apply();
          },
        });
        apply();
        for (const item of items) {
          item.record.locale = locale;
          item.record.attempts = 0;
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          apply();
          const failure = error instanceof Error ? error : new Error(String(error));
          console.error('[Tstlai] Auto-translation failed:', failure);
          try {
            onError?.(failure);
          } catch (observerError) {
            console.error(observerError);
          }
          for (const item of items) item.record.attempts++;
          if (items.some((item) => item.record.attempts <= maxRetries)) {
            schedule(
              () => {
                for (const item of items) dirtyRoots.add(item.node);
                void scan();
              },
              500 * 2 ** Math.max(0, items[0].record.attempts - 1),
            );
          }
        }
      } finally {
        if (bufferTimer) {
          clearTimeout(bufferTimer);
          timers.delete(bufferTimer);
        }
        for (const item of items)
          if (item.record.pending === token) item.record.pending = undefined;
        running = false;
        if (rescan && !abort.signal.aborted) {
          rescan = false;
          void scan();
        }
      }
    };
    if ('requestIdleCallback' in window)
      idle = window.requestIdleCallback(() => {
        void scan();
      });
    else
      schedule(() => {
        void scan();
      }, 100);

    const observer = new MutationObserver((mutations) => {
      let changed = false;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const record = recordsRef.current.get(mutation.target);
          if (!record || record.rendered !== mutation.target.textContent) {
            dirtyRoots.add(mutation.target);
            changed = true;
          }
        } else {
          for (const node of Array.from(mutation.addedNodes)) {
            dirtyRoots.add(node);
            changed = true;
          }
        }
      }
      if (!changed) return;
      if (debounce) {
        clearTimeout(debounce);
        timers.delete(debounce);
      }
      debounce = schedule(() => {
        void scan();
      }, 100);
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => {
      abort.abort();
      observer.disconnect();
      if (idle !== undefined) window.cancelIdleCallback(idle);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [
    endpoint,
    streamEndpoint,
    targetLang,
    stream,
    streamBuffer,
    ignoredTags,
    ignoredClasses,
    maxTexts,
    maxTotalChars,
    maxRetries,
    onError,
  ]);
  return null;
};
