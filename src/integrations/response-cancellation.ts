/** Bind translation lifetime to a Node response, rather than the request body's completion. */
export function responseCancellation(response?: {
  destroyed?: boolean;
  once?(event: string, listener: () => void): unknown;
  removeListener?(event: string, listener: () => void): unknown;
}): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  response?.once?.('close', abort);
  if (response?.destroyed) abort();
  return {
    signal: controller.signal,
    dispose: () => {
      response?.removeListener?.('close', abort);
    },
  };
}
