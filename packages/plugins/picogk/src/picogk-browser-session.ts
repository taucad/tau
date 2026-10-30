import { z } from 'zod';

import {
  picogkBrowserProtocolVersion,
  picogkBrowserReadySchema,
  picogkBrowserResponseSchema,
} from '#picogk.protocol.js';
import { PicogkWorkerError } from '#picogk-worker-error.js';
import type { PicogkBrowserRuntimeFile } from '#picogk-browser-runtime.js';

/** One immutable, authorized project projection. @internal */
export type PicogkBrowserSnapshot = {
  readonly revision: string;
  readonly files: ReadonlyArray<{ readonly path: string; readonly contents: Uint8Array<ArrayBuffer> }>;
};

/** Prepared runtime and compiler references selected by the host. @internal */
export type PicogkBrowserAssets = {
  readonly bootstrapUrl: string;
  readonly compilerIdentity: string;
  readonly runtimeFiles: readonly PicogkBrowserRuntimeFile[];
  readonly references: ReadonlyArray<{ readonly path: string; readonly url: string; readonly sha256: string }>;
};

/** Browser worker ownership and bounded startup/request waits. @internal */
export type PicogkBrowserSessionOptions = {
  readonly createWorker: () => Worker;
  readonly assets: PicogkBrowserAssets;
  readonly recycleHeapBytes?: number;
  /** Milliseconds. */
  readonly startupTimeout: number;
  /** Milliseconds. Zero waits for completion or an explicit abort. */
  readonly requestTimeout: number;
};

/** A typed operation against one source snapshot. @internal */
export type PicogkBrowserRequest<Result> = {
  readonly snapshot: PicogkBrowserSnapshot;
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly schema: z.ZodType<Result>;
  readonly signal: AbortSignal;
};

const envelopeSchema = z.object({
  generation: z.number().int().positive(),
  kind: z.enum(['ready', 'response', 'failed']),
  frame: z.unknown().optional(),
  message: z.string().optional(),
});

type Pending = {
  readonly requestId?: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
};

/** Owns a serialized source-revision worker; aborts destroy its managed heap. @internal */
export class PicogkBrowserSession {
  private worker: Worker | undefined;
  private snapshot: PicogkBrowserSnapshot | undefined;
  private generation = 0;
  private requestOrdinal = 0;
  private pending: Pending | undefined;
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;

  // oxlint-disable-next-line typescript/parameter-properties -- The browser build requires erasable TypeScript syntax.
  private readonly options: PicogkBrowserSessionOptions;
  private listenerController: AbortController | undefined;

  public constructor(options: PicogkBrowserSessionOptions) {
    this.options = options;
    if (
      !Number.isFinite(options.startupTimeout) ||
      options.startupTimeout <= 0 ||
      !Number.isFinite(options.requestTimeout) ||
      options.requestTimeout < 0
    ) {
      throw new Error('Invalid PicoGK browser worker timeouts.');
    }
  }

  /**
   * Submit an operation; a new source immediately invalidates older queued and active work.
   * @param request - Operation and authorized source snapshot.
   * @returns The validated worker result.
   */
  public async request<Result>(request: PicogkBrowserRequest<Result>): Promise<Result> {
    if (this.disposed) {
      throw new Error('The PicoGK browser session is closed.');
    }
    request.signal.throwIfAborted();
    if (this.snapshot?.revision !== request.snapshot.revision) {
      this.stop(new DOMException('The C# source was replaced.', 'AbortError'));
      this.generation++;
      this.snapshot = {
        revision: request.snapshot.revision,
        files: request.snapshot.files.map(({ path, contents }) => ({ path, contents: new Uint8Array(contents) })),
      };
    }
    const { generation } = this;
    const assertCurrent = (): void => {
      request.signal.throwIfAborted();
      if (this.disposed || generation !== this.generation) {
        throw new DOMException('The C# request was superseded.', 'AbortError');
      }
    };
    const execute = async (): Promise<Result> => {
      assertCurrent();
      await this.ensureWorker(request.signal);
      assertCurrent();
      const requestId = String(++this.requestOrdinal);
      const response = picogkBrowserResponseSchema.parse(
        await this.exchange({
          signal: request.signal,
          exchangeTimeout: this.options.requestTimeout,
          requestId,
          send: () => {
            this.worker!.postMessage({
              kind: 'request',
              generation,
              frame: {
                protocolVersion: picogkBrowserProtocolVersion,
                requestId,
                method: request.method,
                params: request.params,
              },
            });
          },
        }),
      );
      assertCurrent();
      if ((response.result === undefined) === (response.error === undefined)) {
        const error = new Error('The PicoGK browser response must contain exactly one result or error.');
        this.stop(error);
        throw error;
      }
      if (response.error) {
        throw new PicogkWorkerError(response.error.issues);
      }
      return request.schema.parse(response.result);
    };
    const previous = this.tail;
    const result = (async () => {
      await previous;
      return execute();
    })();
    this.tail = (async () => {
      try {
        await result;
      } catch {
        /* The caller owns the failure; keep the serial queue usable. */
      }
    })();
    return result;
  }

  /**
   * Read a delivered mesh in bounded transfers from its existing worker generation.
   * @param options - Build receipt, authorized snapshot and operation cancellation.
   * @returns Owned bytes after checking the complete build digest.
   */
  public async readArtifact(options: {
    readonly snapshot: PicogkBrowserSnapshot;
    readonly artifact: { readonly artifactPath: string; readonly byteLength: number; readonly sha256: string };
    readonly signal: AbortSignal;
  }): Promise<Uint8Array<ArrayBuffer>> {
    const { worker, generation } = this;
    const assertCurrent = (): void => {
      options.signal.throwIfAborted();
      if (
        !worker ||
        this.worker !== worker ||
        this.generation !== generation ||
        this.snapshot?.revision !== options.snapshot.revision ||
        this.disposed
      ) {
        throw new DOMException('The PicoGK artifact generation is no longer available.', 'AbortError');
      }
    };
    assertCurrent();
    const { artifactPath, byteLength, sha256 } = options.artifact;
    if (!Number.isSafeInteger(byteLength) || byteLength < 0 || !/^[a-f\d]{64}$/iu.test(sha256)) {
      throw new Error('Invalid PicoGK artifact receipt.');
    }
    const bytes = new Uint8Array(byteLength);
    for (let offset = 0; offset < byteLength || offset === 0; offset += 8 * 1024 * 1024) {
      assertCurrent();
      const length = Math.min(8 * 1024 * 1024, byteLength - offset);
      // oxlint-disable-next-line no-await-in-loop -- Transfer one bounded chunk at a time from the owning generation.
      const chunk = await this.request({
        snapshot: options.snapshot,
        method: '$readArtifact',
        params: { artifactPath, byteLength, sha256, offset, length },
        schema: z.instanceof(Uint8Array),
        signal: options.signal,
      });
      assertCurrent();
      if (chunk.length !== length) {
        throw new Error('Incomplete PicoGK artifact transfer.');
      }
      bytes.set(chunk, offset);
    }
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    assertCurrent();
    if (digest !== sha256.toLowerCase()) {
      throw new Error('PicoGK artifact integrity mismatch.');
    }
    return bytes;
  }

  /** Terminate active work and release worker callbacks; queued requests remain rejected. */
  public cleanup(): void {
    this.disposed = true;
    this.stop(new DOMException('The PicoGK browser session was closed.', 'AbortError'));
    this.snapshot = undefined;
  }

  private async ensureWorker(signal: AbortSignal): Promise<void> {
    if (this.worker) {
      return;
    }
    const worker = this.options.createWorker();
    this.worker = worker;
    const listeners = new AbortController();
    this.listenerController = listeners;
    worker.addEventListener(
      'message',
      (event: MessageEvent<unknown>): void => {
        if (this.worker !== worker) {
          return;
        }
        try {
          const envelope = envelopeSchema.parse(event.data);
          if (envelope.generation !== this.generation) {
            return;
          }
          if (envelope.kind === 'failed') {
            this.stop(new Error(envelope.message ?? 'The PicoGK browser worker failed.'));
            return;
          }
          const frame =
            envelope.kind === 'ready'
              ? picogkBrowserReadySchema.parse(envelope.frame)
              : picogkBrowserResponseSchema.parse(envelope.frame);
          const requestId = 'requestId' in frame ? frame.requestId : undefined;
          if (requestId !== this.pending?.requestId) {
            return;
          }
          this.pending?.resolve(frame);
        } catch (error) {
          this.stop(new Error('Invalid PicoGK browser worker message.', { cause: error }));
        }
      },
      { signal: listeners.signal },
    );
    worker.addEventListener(
      'error',
      (event): void => {
        if (this.worker === worker) {
          this.stop(new Error(event.message || 'The PicoGK browser worker crashed.'));
        }
      },
      { signal: listeners.signal },
    );
    worker.addEventListener(
      'messageerror',
      (): void => {
        if (this.worker === worker) {
          this.stop(new Error('The PicoGK browser worker sent an unreadable message.'));
        }
      },
      { signal: listeners.signal },
    );
    await this.exchange({
      signal,
      exchangeTimeout: this.options.startupTimeout,
      send: () => {
        const snapshot = {
          ...this.snapshot!,
          files: this.snapshot!.files.map(({ path, contents }) => ({ path, contents: new Uint8Array(contents) })),
        };
        worker.postMessage(
          {
            kind: 'initialize',
            generation: this.generation,
            snapshot,
            assets: this.options.assets,
            recycleHeapBytes: this.options.recycleHeapBytes,
          },
          snapshot.files.map(({ contents }) => contents.buffer),
        );
      },
    });
  }

  private async exchange(options: {
    readonly signal: AbortSignal;
    /** Milliseconds. */
    readonly exchangeTimeout: number;
    readonly requestId?: string;
    readonly send: () => void;
  }): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = (): void => {
      this.stop(new DOMException('The PicoGK browser request was aborted.', 'AbortError'));
    };
    try {
      return await new Promise<unknown>((resolve, reject) => {
        this.pending = { requestId: options.requestId, resolve, reject };
        options.signal.addEventListener('abort', abort, { once: true });
        if (options.signal.aborted) {
          abort();
          return;
        }
        if (options.exchangeTimeout > 0) {
          timer = setTimeout(() => {
            this.stop(new Error('The PicoGK browser request timed out.'));
          }, options.exchangeTimeout);
        }
        try {
          options.send();
        } catch (error) {
          this.stop(error instanceof Error ? error : new Error(String(error)));
        }
      });
    } finally {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', abort);
      this.pending = undefined;
    }
  }

  private stop(error: Error): void {
    const { worker } = this;
    this.worker = undefined;
    if (worker) {
      this.listenerController?.abort();
      this.listenerController = undefined;
      worker.terminate();
    }
    this.pending?.reject(error);
  }
}
