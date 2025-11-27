import { Tstlai } from '../core/Tstlai';

// Generic interfaces matching Express/Connect
interface Request {
  headers: any;
  [key: string]: any;
}

interface Response {
  write: (chunk: any, ...args: any[]) => boolean;
  end: (chunk: any, ...args: any[]) => any;
  getHeader: (name: string) => any;
  setHeader: (name: string, value: any) => void;
  [key: string]: any;
}

interface NextFunction {
  (err?: any): void;
}

export const createExpressMiddleware = (translator: Tstlai) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalWrite = res.write;
    const originalEnd = res.end;
    let buffer = '';
    let isHtml = false;

    // Helper to check content type
    const checkHtml = () => {
      const contentType = res.getHeader('content-type');
      return contentType && (contentType as string).includes('text/html');
    };

    // Override write to buffer content
    res.write = function (chunk: any, ...args: any[]) {
      // We only buffer if it looks like we might be HTML or we haven't decided yet
      // Simple strategy: Buffer everything.
      // Production strategy: Check Content-Type header as soon as possible.
      buffer += chunk.toString();
      return true; // Respect backpressure?
    };

    // Override end to process and send
    res.end = function (chunk: any, ...args: any[]) {
      if (chunk) {
        buffer += chunk.toString();
      }

      // Check if HTML
      if (checkHtml()) {
        // We must handle the async translation
        translator.process(buffer)
          .then((result) => {
            const translatedHtml = result.html;
            // Update Content-Length if it was set
            if (res.getHeader('content-length')) {
              res.setHeader('content-length', Buffer.byteLength(translatedHtml));
            }
            
            // Restore original methods to avoid loop? 
            // Actually we just call apply on the original function reference.
            originalEnd.apply(res, [translatedHtml, ...args]);
          })
          .catch((err) => {
            console.error('[Tstlai] Middleware Error:', err);
            // Fallback to original content
            originalEnd.apply(res, [buffer, ...args]);
          });
          
        return res;
      } else {
        // Not HTML, just pass through
        return originalEnd.apply(res, [buffer, ...args]);
      }
    };

    next();
  };
};
