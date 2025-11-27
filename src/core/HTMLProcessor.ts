import { parse, HTMLElement, Node } from 'node-html-parser';
import * as crypto from 'crypto';

export interface TextNodeRef {
  id: string;
  text: string;
  hash: string;
  node: Node;
}

export class HTMLProcessor {
  // Tags to ignore during translation
  private static IGNORED_TAGS = new Set(['script', 'style', 'code', 'pre', 'textarea']);
  
  parse(html: string): HTMLElement {
    return parse(html);
  }

  extractTextNodes(root: HTMLElement): TextNodeRef[] {
    const textNodes: TextNodeRef[] = [];
    
    const walk = (node: Node) => {
      // Skip if it's an element node that should be ignored
      if (node.nodeType === 1) { // Element
        const element = node as HTMLElement;
        
        // Check if tagName exists before lowercasing (Root node might not have it)
        if (element.tagName && HTMLProcessor.IGNORED_TAGS.has(element.tagName.toLowerCase())) {
          return;
        }
        
        // Also check for data-no-translate attribute
        if (element.hasAttribute && element.hasAttribute('data-no-translate')) {
          return;
        }
      }

      // Text node
      if (node.nodeType === 3) {
        const text = node.text.trim();
        if (text.length > 0) {
          // Generate hash
          const hash = crypto.createHash('sha256').update(text).digest('hex');
          
          textNodes.push({
            id: Math.random().toString(36).substring(7),
            text: node.text, // Keep original text including whitespace for restoration if needed? No, we replace content.
            // Actually, we want to translate the trimmed text but preserve whitespace logic if possible.
            // For MVP, we'll just replace the text content.
            hash,
            node
          });
        }
      }

      // Recurse
      node.childNodes.forEach(walk);
    };

    walk(root);
    return textNodes;
  }

  applyTranslations(textNodes: TextNodeRef[], translations: Map<string, string>): void {
    textNodes.forEach(ref => {
      const translatedText = translations.get(ref.hash);
      if (translatedText) {
        ref.node.textContent = translatedText;
      }
    });
  }
}
