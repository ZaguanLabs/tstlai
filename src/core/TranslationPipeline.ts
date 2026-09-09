import { BatchingConfig } from '../types';

export function abortError(): Error {
  return new DOMException('Translation cancelled', 'AbortError');
}

/** Race an operation without leaving abort listeners attached after it settles. */
export function abortable<T>(operation: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(operation)
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', abort);
      });
  });
}

type Item = { key: string; text: string };
export type PipelineEvent =
  | { key: string; translation: string; cached: boolean; committed: boolean }
  | { key: string; error: Error };

type Listener = (event: PipelineEvent) => void;
type Flight = Item & { listeners: Set<Listener>; latest?: PipelineEvent; job: Job };
type Job = { flights: Flight[]; locale: string; stream: boolean; controller: AbortController };

type Operations = {
  read(keys: string[]): Promise<(string | null)[]>;
  write(entries: [string, string][]): Promise<void>;
  translate(
    texts: string[],
    locale: string,
    stream: boolean,
    signal: AbortSignal,
    progress: (index: number, translation: string) => void,
  ): Promise<string[]>;
};

/** Per-translator scheduler. Flights are shared before cache lookup, including cache misses. */
export class TranslationPipeline {
  readonly limits: Required<BatchingConfig>;
  private flights = new Map<string, Flight>();
  private queue: Job[] = [];
  private providerQueue: { job: Job; misses: Flight[] }[] = [];
  private cacheRunning = 0;
  private providerRunning = 0;
  private running = new Set<Promise<void>>();
  private activeJobs = new Map<Job, number>();
  private closed = false;

  constructor(
    private operations: Operations,
    config: BatchingConfig = {},
  ) {
    this.limits = {
      maxTexts: config.maxTexts ?? 100,
      maxTotalChars: config.maxTotalChars ?? 100000,
      concurrency: config.concurrency ?? 2,
      delayMs: config.delayMs ?? 50,
    };
    for (const [key, value] of Object.entries(this.limits)) {
      if (!Number.isSafeInteger(value) || value < (key === 'delayMs' ? 0 : 1)) {
        throw new Error(`Invalid batching.${key}`);
      }
    }
  }

  assertOpen(signal?: AbortSignal): void {
    if (signal?.aborted) throw abortError();
    if (this.closed) throw new Error('Translator is closed');
  }

  async *run(
    items: Item[],
    locale: string,
    stream: boolean,
    signal?: AbortSignal,
  ): AsyncGenerator<PipelineEvent> {
    this.assertOpen(signal);
    const events: PipelineEvent[] = [];
    let wake: (() => void) | undefined;
    let cancelled = false;
    let remaining = 0;
    const subscribed: Flight[] = [];
    const pending = new Set<string>();
    const listener: Listener = (event) => {
      events.push(event);
      if ('error' in event || event.committed) {
        if (pending.delete(event.key)) remaining--;
      }
      wake?.();
    };
    const release = () => {
      for (const flight of subscribed) flight.listeners.delete(listener);
      for (const job of new Set(subscribed.map((f) => f.job))) {
        if (job.flights.every((f) => f.listeners.size === 0)) {
          job.controller.abort();
          for (const flight of job.flights) {
            if (this.flights.get(flight.key) === flight) this.flights.delete(flight.key);
          }
        }
      }
      this.queue = this.queue.filter((job) => !job.controller.signal.aborted);
      this.providerQueue = this.providerQueue.filter(({ job }) => !job.controller.signal.aborted);
    };
    const abort = () => {
      cancelled = true;
      release();
      wake?.();
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      let job: Job | undefined;
      let chars = 0;
      for (const item of items) {
        if (pending.has(item.key)) continue;
        pending.add(item.key);
        remaining++;
        let flight = this.flights.get(item.key);
        if (!flight) {
          if (
            !job ||
            job.flights.length >= this.limits.maxTexts ||
            chars + item.text.length > this.limits.maxTotalChars
          ) {
            job = { flights: [], locale, stream, controller: new AbortController() };
            chars = 0;
            this.queue.push(job);
          }
          flight = { ...item, listeners: new Set(), job };
          chars += item.text.length;
          job.flights.push(flight);
          this.flights.set(item.key, flight);
        }
        subscribed.push(flight);
        flight.listeners.add(listener);
        if (flight.latest) listener(flight.latest);
      }
      this.pump();
      while (remaining > 0 || events.length > 0) {
        if (cancelled) throw abortError();
        const event = events.shift();
        if (event) yield event;
        else
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
      }
      if (cancelled) throw abortError();
    } finally {
      signal?.removeEventListener('abort', abort);
      release();
    }
  }

  private publish(flight: Flight, event: PipelineEvent): void {
    flight.latest = event;
    for (const listener of flight.listeners) listener(event);
    if ('error' in event || event.committed) {
      if (this.flights.get(flight.key) === flight) this.flights.delete(flight.key);
    }
  }

  private pump(): void {
    while (!this.closed && this.cacheRunning < this.limits.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      if (job.controller.signal.aborted) continue;
      this.cacheRunning++;
      this.start(
        job,
        () => this.readCache(job),
        () => {
          this.cacheRunning--;
        },
      );
    }
    while (
      !this.closed &&
      this.providerRunning < this.limits.concurrency &&
      this.providerQueue.length
    ) {
      const { job, misses } = this.providerQueue.shift()!;
      if (job.controller.signal.aborted) continue;
      this.providerRunning++;
      this.start(
        job,
        () => this.translate(job, misses),
        () => {
          this.providerRunning--;
        },
      );
    }
  }

  private start(job: Job, operation: () => Promise<void>, finished: () => void): void {
    this.activeJobs.set(job, (this.activeJobs.get(job) || 0) + 1);
    const task = operation()
      .catch((error) => this.fail(job, error))
      .finally(() => {
        const active = this.activeJobs.get(job)! - 1;
        if (active) this.activeJobs.set(job, active);
        else this.activeJobs.delete(job);
        this.running.delete(task);
        finished();
        this.pump();
      });
    this.running.add(task);
  }

  private async readCache(job: Job): Promise<void> {
    const { signal } = job.controller;
    const cached = await abortable(this.operations.read(job.flights.map((f) => f.key)), signal);
    const misses: Flight[] = [];
    job.flights.forEach((flight, index) => {
      if (cached[index] !== null && cached[index] !== undefined) {
        this.publish(flight, {
          key: flight.key,
          translation: cached[index]!,
          cached: true,
          committed: true,
        });
      } else misses.push(flight);
    });
    if (misses.length) this.providerQueue.push({ job, misses });
  }

  private async translate(job: Job, misses: Flight[]): Promise<void> {
    const { signal } = job.controller;
    const values = await abortable(
      this.operations.translate(
        misses.map((f) => f.text.trim()),
        job.locale,
        job.stream,
        signal,
        (index, translation) => {
          if (signal.aborted) return;
          const flight = misses[index];
          this.publish(flight, { key: flight.key, translation, cached: false, committed: false });
        },
      ),
      signal,
    );
    signal.throwIfAborted();
    await abortable(this.operations.write(misses.map((f, i) => [f.key, values[i]])), signal);
    signal.throwIfAborted();
    misses.forEach((flight, index) =>
      this.publish(flight, {
        key: flight.key,
        translation: values[index],
        cached: false,
        committed: true,
      }),
    );
  }

  private fail(job: Job, error: unknown): void {
    const failure = job.controller.signal.aborted
      ? abortError()
      : error instanceof Error
        ? error
        : new Error(String(error));
    for (const flight of job.flights) {
      if (!flight.latest || (!('error' in flight.latest) && !flight.latest.committed)) {
        this.publish(flight, { key: flight.key, error: failure });
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of [
      ...this.queue,
      ...this.providerQueue.map((entry) => entry.job),
      ...this.activeJobs.keys(),
    ]) {
      job.controller.abort();
      for (const flight of job.flights)
        this.publish(flight, { key: flight.key, error: abortError() });
    }
    this.queue = [];
    this.providerQueue = [];
    await Promise.all(this.running);
    this.flights.clear();
  }
}
