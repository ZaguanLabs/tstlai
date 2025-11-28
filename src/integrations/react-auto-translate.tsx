'use client';

import { useEffect, useRef } from 'react';

interface AutoTranslateProps {
  endpoint?: string;
  targetLang?: string;
  ignoredTags?: string[];
  ignoredClasses?: string[];
}

export const AutoTranslate = ({
  endpoint = '/api/tstlai/translate',
  targetLang,
  ignoredTags = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT'],
  ignoredClasses = ['notranslate'],
}: AutoTranslateProps) => {
  const processingRef = useRef(new Set<Node>());
  const observerRef = useRef<MutationObserver | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const scanAndTranslate = async () => {
      const textNodes: { node: Node; text: string }[] = [];

      const walk = (node: Node) => {
        if (processingRef.current.has(node)) return;

        // Element Check
        if (node.nodeType === 1) {
          // Element
          const el = node as HTMLElement;
          if (ignoredTags.includes(el.tagName)) return;
          if (el.getAttribute('data-no-translate')) return;
          if (ignoredClasses.some((cls) => el.classList.contains(cls))) return;
        }

        // Text Node Check
        if (node.nodeType === 3) {
          // Text
          const text = node.textContent?.trim();
          if (text && text.length > 1 && !/^\d+$/.test(text)) {
            textNodes.push({ node, text });
            processingRef.current.add(node);
          }
        }

        node.childNodes.forEach(walk);
      };

      walk(document.body);

      if (textNodes.length === 0) return;

      try {
        // Send to API
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: textNodes.map((t) => t.text),
            targetLang,
          }),
        });

        const data = await response.json();

        // Apply translations
        textNodes.forEach((item, index) => {
          if (data.translations && data.translations[index]) {
            item.node.textContent = data.translations[index];
          }
        });
      } catch (err) {
        console.error('[Tstlai] Auto-translation failed:', err);
      }
    };

    // Initial Scan
    // Use requestIdleCallback if available to not block hydration
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(scanAndTranslate);
    } else {
      setTimeout(scanAndTranslate, 1000);
    }

    // Observe for new content (Suspense/Navigation) with debounce
    observerRef.current = new MutationObserver(() => {
      // Debounce to avoid spamming API on rapid DOM updates
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
  }, [endpoint, targetLang, ignoredTags, ignoredClasses]);

  return null; // Renderless component
};
