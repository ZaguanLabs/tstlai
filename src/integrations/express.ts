import { responseCancellation } from './response-cancellation';
import { Tstlai } from '../core/Tstlai';
import { TRANSFORMED_HEADERS } from './response-headers';

// Generic interfaces matching Express/Connect
interface Request {
  headers: any;
  [key: string]: any;
}

interface Response {
  destroyed?: boolean;
  once?(event: string, listener: () => void): unknown;
  removeListener?(event: string, listener: () => void): unknown;
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
    const chunks: Buffer[] = [];
    let buffering: boolean | undefined;
    const shouldBuffer = () => {
      if (buffering === undefined) {
        const contentType = res.getHeader('content-type');
        buffering =
          typeof contentType === 'string' &&
          contentType.includes('text/html') &&
          !res.getHeader('content-encoding') &&
          !res.headersSent &&
          req.method !== 'HEAD' &&
          res.statusCode !== 204 &&
          res.statusCode !== 304;
      }
      return buffering;
    };
    const append = (chunk: any, encoding?: any) => {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(
          typeof chunk === 'string'
            ? Buffer.from(
                chunk,
                typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8',
              )
            : Buffer.from(chunk),
        );
      }
    };

    res.write = function (chunk: any, ...args: any[]) {
      if (!shouldBuffer()) return originalWrite.apply(res, [chunk, ...args]);
      append(chunk, args[0]);
      const callback = args.find((arg) => typeof arg === 'function');
      // The middleware has consumed the chunk into its own buffer.
      if (callback) queueMicrotask(callback);
      return true;
    };

    res.end = function (chunk: any, ...args: any[]) {
      if (!shouldBuffer()) return originalEnd.apply(res, [chunk, ...args]);
      const callback = [chunk, ...args].find((arg) => typeof arg === 'function');
      if (typeof chunk !== 'function') append(chunk, args[0]);
      const originalBody = Buffer.concat(chunks);
      chunks.length = 0;
      const cancellation = responseCancellation(res);
      const send = (body: Buffer | string) => {
        cancellation.dispose();
        res.write = originalWrite;
        res.end = originalEnd;
        if (!res.destroyed) originalEnd.call(res, body, callback);
      };
      translator
        .process(originalBody.toString('utf8'), { signal: cancellation.signal })
        .then((result) => {
          if (cancellation.signal.aborted) {
            send(originalBody);
            return;
          }
          const hadLength = res.getHeader('content-length') !== undefined;
          for (const name of TRANSFORMED_HEADERS) res.removeHeader?.(name);
          if (hadLength) res.setHeader('content-length', Buffer.byteLength(result.html));
          send(result.html);
        })
        .catch((error) => {
          if (!cancellation.signal.aborted) console.error('[Tstlai] Middleware Error:', error);
          send(originalBody);
        });
      return res;
    };

    next();
  };
};
