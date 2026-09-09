/** Tracks JSON structure across chunks and emits strings only from the root translation array. */
export class TranslationStreamParser {
  private stack: Array<{
    kind: 'object' | 'array';
    key?: string;
    expectingKey?: boolean;
    translations?: boolean;
  }> = [];
  private token = '';
  private inString = false;
  private escaped = false;
  private stringIsTranslation = false;
  private arrayState: 'valueOrEnd' | 'value' | 'commaOrEnd' = 'valueOrEnd';
  private index = 0;

  constructor(private readonly expectedCount: number) {}

  *push(content: string): Generator<{ index: number; translation: string }> {
    for (const char of content) {
      if (this.inString) {
        this.token += char;
        if (this.escaped) {
          this.escaped = false;
          continue;
        }
        if (char === '\\') {
          this.escaped = true;
          continue;
        }
        if (char !== '"') continue;
        this.inString = false;
        const value: string = JSON.parse(this.token);
        const parent = this.stack[this.stack.length - 1];
        if (this.stringIsTranslation) {
          if (this.index >= this.expectedCount) throw new Error('Too many streamed translations');
          this.arrayState = 'commaOrEnd';
          yield { index: this.index++, translation: value };
        } else if (parent?.kind === 'object' && parent.expectingKey) {
          parent.key = value;
          parent.expectingKey = false;
        }
        this.token = '';
        continue;
      }

      const parent = this.stack[this.stack.length - 1];
      if (/\s/.test(char)) continue;
      if (parent?.translations) {
        if (char === ']') {
          if (this.arrayState === 'value')
            throw new Error('Invalid trailing comma in translations');
        } else if (char === ',') {
          if (this.arrayState !== 'commaOrEnd') throw new Error('Invalid translation separator');
          this.arrayState = 'value';
          continue;
        } else if (char !== '"' || this.arrayState === 'commaOrEnd') {
          throw new Error('Invalid translation response: expected a string element');
        }
      }
      if (char === '"') {
        this.inString = true;
        this.token = char;
        this.stringIsTranslation = !!parent?.translations;
      } else if (char === '{') {
        this.stack.push({ kind: 'object', expectingKey: true });
      } else if (char === '[') {
        const translations =
          this.stack.length === 0 ||
          (this.stack.length === 1 && parent?.kind === 'object' && parent.key === 'translations');
        if (translations) this.arrayState = 'valueOrEnd';
        this.stack.push({ kind: 'array', translations });
      } else if (char === '}' || char === ']') {
        this.stack.pop();
      } else if (char === ',' && parent?.kind === 'object') {
        parent.expectingKey = true;
        parent.key = undefined;
      }
    }
  }

  get emittedCount(): number {
    return this.index;
  }
}
