// A hermetic registry for the in-process tiers: an injected `fetch` that answers only routed URLs, records every
// request and can fail, stall or throttle one URL, so download, retry, fallback and cancellation are observable
// without a socket.

/**
 * How the fake registry answers one URL.
 * @public
 */
export type FakeRoute = {
  /** Body; absent answers `status` (default 404). */
  readonly bytes?: Uint8Array<ArrayBuffer>;
  readonly status?: number;
  /** Resolves when the response may start. */
  readonly hold?: Promise<void>;
  /** Delay between body chunks of 64 KiB, in milliseconds: a throttled origin. */
  readonly chunkDelay?: number;
};

/**
 * A hermetic registry.
 * @public
 */
export type FakeRegistry = {
  /** The transport a host or command is given. */
  readonly fetch: typeof fetch;
  /** Every requested URL, in order. */
  readonly calls: readonly string[];
  /**
   * Answer one URL.
   * @param url - Absolute URL.
   * @param route - Its answer.
   */
  route(url: string, route: FakeRoute): void;
  /**
   * Requests made for one URL.
   * @param url - Absolute URL.
   * @returns The count.
   */
  count(url: string): number;
};

const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const chunkSize = 64 * 1024;

const delay = async (milliseconds: number, signal: AbortSignal | undefined): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
      },
      { once: true },
    );
  });
};

const bodyOf = (
  bytes: Uint8Array<ArrayBuffer>,
  chunkDelay: number | undefined,
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array<ArrayBuffer>> =>
  new ReadableStream<Uint8Array<ArrayBuffer>>({
    async start(controller) {
      try {
        for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
          if (chunkDelay !== undefined) {
            // oxlint-disable-next-line no-await-in-loop -- a throttled origin sends one chunk at a time
            await delay(chunkDelay, signal);
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

/**
 * Create a hermetic registry: unrouted URLs answer 404, and every request is recorded.
 * @param routes - Initial URL to bytes routes, such as a fixture closure's `routes`.
 * @returns The registry.
 * @public
 */
export const createFakeRegistry = (routes: ReadonlyMap<string, Uint8Array<ArrayBuffer>> = new Map()): FakeRegistry => {
  const table = new Map<string, FakeRoute>([...routes].map(([url, bytes]) => [url, { bytes }]));
  const calls: string[] = [];
  return {
    calls,
    route(url, route) {
      table.set(url, route);
    },
    count(url) {
      return calls.filter((call) => call === url).length;
    },
    async fetch(input, init) {
      const url = urlOf(input);
      calls.push(url);
      const signal = init?.signal ?? undefined;
      signal?.throwIfAborted();
      const route = table.get(url);
      if (route?.hold !== undefined) {
        await route.hold;
        signal?.throwIfAborted();
      }
      if (route?.bytes === undefined) {
        return new Response('not found', { status: route?.status ?? 404 });
      }
      return new Response(bodyOf(route.bytes, route.chunkDelay, signal), {
        status: 200,
        headers: { 'content-length': String(route.bytes.byteLength) },
      });
    },
  };
};
