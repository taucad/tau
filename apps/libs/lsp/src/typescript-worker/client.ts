import type { TauLanguageHostInit } from '#language-fs-sync-host.js';
import type { TypeScriptTextChange } from '#typescript-worker/typescript-service.js';
import type {
  TypeScriptWorkerCommand,
  TypeScriptWorkerRequest,
  TypeScriptWorkerResponse,
} from '#typescript-worker/protocol.js';

export type TypeScriptWorkerClientOptions = Readonly<{
  openLanguageHostPort?: () => TauLanguageHostInit | undefined;
  createWorker?: () => Worker;
  onFatal?: (error: Error) => void;
}>;

/** A project-scoped, editor-independent TypeScript worker client. */
export class TypeScriptWorkerClient {
  private readonly worker: Worker;
  private nextId = 0;
  private disposed = false;
  private failed: Error | undefined;
  private readonly onFatal: ((error: Error) => void) | undefined;
  private readonly pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();

  public constructor(options: TypeScriptWorkerClientOptions = {}) {
    this.onFatal = options.onFatal;
    this.worker =
      options.createWorker?.() ??
      new Worker(new URL('worker.entry.ts', import.meta.url), {
        type: 'module',
        name: 'tau-typescript-service',
      });
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('error', this.onError);
    this.worker.addEventListener('messageerror', this.onMessageError);
    try {
      const syncFs = options.openLanguageHostPort?.();
      if (syncFs) {
        this.worker.postMessage({ type: 'tau:typescript-init', syncFs }, [syncFs.port]);
      } else {
        this.worker.postMessage({ type: 'tau:typescript-init' });
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async open(uri: string, text: string, version: number): Promise<void> {
    await this.request({ kind: 'open', uri, text, version });
  }

  public async change(
    event: Readonly<{
      uri: string;
      previousVersion: number;
      version: number;
      changes: readonly TypeScriptTextChange[];
    }>,
  ): Promise<void> {
    await this.request({ kind: 'change', ...event });
  }

  public async close(uri: string): Promise<void> {
    await this.request({ kind: 'close', uri });
  }

  public async setExtraLib(uri: string, text: string, version = 1): Promise<void> {
    await this.request({ kind: 'setExtraLib', uri, text, version });
  }

  public async removeExtraLib(uri: string): Promise<void> {
    await this.request({ kind: 'removeExtraLib', uri });
  }

  public async request<T = unknown>(command: TypeScriptWorkerCommand, signal?: AbortSignal): Promise<T> {
    if (this.disposed) {
      throw new Error('TypeScript worker client disposed');
    }
    if (this.failed) {
      throw this.failed;
    }
    if (signal?.aborted) {
      throw new DOMException('TypeScript request aborted', 'AbortError');
    }
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        this.pending.delete(id);
        reject(new DOMException('TypeScript request aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const pending = {
        resolve: (result) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(result as T);
        },
        reject: (error) => {
          signal?.removeEventListener('abort', onAbort);
          reject(error);
        },
      } satisfies { resolve: (result: unknown) => void; reject: (error: Error) => void };
      this.pending.set(id, pending);
      const message: TypeScriptWorkerRequest = { id, command };
      try {
        this.worker.postMessage(message);
      } catch (error) {
        this.pending.delete(id);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onError);
    this.worker.removeEventListener('messageerror', this.onMessageError);
    if (!this.failed) {
      this.worker.terminate();
    }
    for (const pending of this.pending.values()) {
      pending.reject(new Error('TypeScript worker client disposed'));
    }
    this.pending.clear();
  }

  private readonly onMessage = (event: MessageEvent<TypeScriptWorkerResponse>): void => {
    const response = event.data;
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error));
    }
  };

  private readonly onError = (event: ErrorEvent): void => {
    this.fail(new Error(event.message || 'TypeScript worker failed'));
  };

  private readonly onMessageError = (): void => {
    this.fail(new Error('TypeScript worker returned an unreadable message'));
  };

  private fail(error: Error): void {
    if (this.disposed || this.failed) {
      return;
    }
    this.failed = error;
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onError);
    this.worker.removeEventListener('messageerror', this.onMessageError);
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    this.onFatal?.(error);
  }
}
