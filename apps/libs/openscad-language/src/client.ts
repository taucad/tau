import { JSONRPCServer } from 'json-rpc-2.0';
import type { JSONRPCRequest } from 'json-rpc-2.0';
import type * as LSP from 'vscode-languageserver-protocol';
import { serveLanguageFileSystemRequests } from '@taucad/lsp/language-fs-bridge';
import type { ServeLanguageFileSystemOptions } from '@taucad/lsp/language-fs-bridge';
import type { OpenscadLanguageAssets, OpenscadWorkerCommand, OpenscadWorkerEvent } from '#protocol.js';

/** An LSP error response from the OpenSCAD server. */
export class OpenscadLanguageError extends Error {
  public readonly code: number;

  public constructor(code: number, message: string) {
    super(message);
    this.name = 'OpenscadLanguageError';
    this.code = code;
  }
}

export type OpenscadLanguageClientOptions = Readonly<{
  assets: OpenscadLanguageAssets;
  /** The project's filesystem owners; the worker reads closed files through them. */
  fs: ServeLanguageFileSystemOptions & Readonly<{ rootDirectory: string }>;
  createWorker?: () => Worker;
  /** The worker stopped: boot failure, crash or runtime abort. Every pending request has been rejected. */
  onFatal?: (error: Error) => void;
}>;

const observe = async (promise: Promise<unknown>): Promise<void> => {
  try {
    await promise;
  } catch {
    /* Callers that await readiness receive the rejection themselves. */
  }
};

type Pending = { resolve: (result: unknown) => void; reject: (error: Error) => void };

/**
 * Main-thread client for one project's OpenSCAD language worker. Requests are LSP JSON-RPC; the worker answers `fs/*`
 * requests through `serveLanguageFileSystemRequests`, so the file manager stays the only filesystem authority.
 */
export class OpenscadLanguageClient {
  readonly #worker: Worker;
  readonly #fsServer = new JSONRPCServer();
  readonly #fsDisposable: { dispose(): void };
  readonly #pending = new Map<number, Pending>();
  readonly #ready = Promise.withResolvers<number>();
  readonly #onFatal: ((error: Error) => void) | undefined;
  #nextId = 0;
  #failure: Error | undefined;
  #disposed = false;
  #capabilities: LSP.ServerCapabilities = {};

  public constructor(options: OpenscadLanguageClientOptions) {
    this.#onFatal = options.onFatal;
    this.#fsDisposable = serveLanguageFileSystemRequests(this.#fsServer, options.fs);
    // Readiness may fail before anyone awaits it; observe it so the rejection is not unhandled.
    void observe(this.#ready.promise);
    this.#worker =
      options.createWorker?.() ??
      new Worker(new URL('openscad-language.worker.ts', import.meta.url), {
        type: 'module',
        name: 'tau-openscad-language',
      });
    this.#worker.addEventListener('message', this.#onMessage);
    this.#worker.addEventListener('error', this.#onError);
    this.#worker.addEventListener('messageerror', this.#onError);
    this.#post({
      type: 'init',
      assets: options.assets,
      rootDirectory: options.fs.paths.toAbsolutePath(''),
      filePoolBuffer: options.fs.filePoolBuffer,
    });
  }

  public get capabilities(): LSP.ServerCapabilities {
    return this.#capabilities;
  }

  /** Boot the runtime, load the project and run the LSP initialize handshake. */
  public async initialize(): Promise<LSP.InitializeResult> {
    await this.#ready.promise;
    const result = await this.request<LSP.InitializeResult>('initialize', {
      processId: null,
      rootUri: null,
      capabilities: {},
    } satisfies LSP.InitializeParams);
    this.#capabilities = result.capabilities;
    this.notify('initialized', {});
    return result;
  }

  public async request<T>(method: string, params: unknown): Promise<T> {
    if (this.#disposed) {
      throw new Error('OpenSCAD language client disposed');
    }
    if (this.#failure) {
      throw this.#failure;
    }
    const id = ++this.#nextId;
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();
    this.#pending.set(id, { resolve, reject });
    this.#post({ type: 'lsp', message: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    return promise as Promise<T>;
  }

  public notify(method: string, params: unknown): void {
    if (this.#disposed || this.#failure) {
      return;
    }
    this.#post({ type: 'lsp', message: JSON.stringify({ jsonrpc: '2.0', method, params }) });
  }

  /** Re-read closed OpenSCAD files after the project tree changed. */
  public refreshWorkspace(): void {
    if (!this.#disposed && !this.#failure) {
      this.#post({ type: 'refresh' });
    }
  }

  public dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#worker.removeEventListener('message', this.#onMessage);
    this.#worker.removeEventListener('error', this.#onError);
    this.#worker.removeEventListener('messageerror', this.#onError);
    this.#worker.terminate();
    this.#fsDisposable.dispose();
    this.#rejectAll(new Error('OpenSCAD language client disposed'));
    this.#ready.reject(new Error('OpenSCAD language client disposed'));
  }

  #post(command: OpenscadWorkerCommand): void {
    this.#worker.postMessage(command);
  }

  readonly #onMessage = (event: MessageEvent<OpenscadWorkerEvent>): void => {
    const message = event.data;
    switch (message.type) {
      case 'ready': {
        this.#ready.resolve(message.files);
        break;
      }
      case 'lsp': {
        this.#receive(message.message);
        break;
      }
      case 'fs-request': {
        void this.#serveFs(message.request);
        break;
      }
      case 'fatal': {
        this.#fail(new Error(`OpenSCAD language worker failed: ${message.message}`));
        break;
      }
    }
  };

  readonly #onError = (event: Event): void => {
    const message = 'message' in event && typeof event.message === 'string' ? event.message : undefined;
    const detail = message ? `: ${message}` : '';
    this.#fail(new Error(`OpenSCAD language worker crashed${detail}`));
  };

  #receive(raw: string): void {
    const response = JSON.parse(raw) as {
      id?: number;
      result?: unknown;
      error?: { code: number; message: string };
    };
    if (typeof response.id !== 'number') {
      return;
    }
    const pending = this.#pending.get(response.id);
    this.#pending.delete(response.id);
    if (response.error) {
      pending?.reject(new OpenscadLanguageError(response.error.code, response.error.message));
    } else {
      pending?.resolve(response.result ?? undefined);
    }
  }

  async #serveFs(request: JSONRPCRequest): Promise<void> {
    const response = await this.#fsServer.receive(request);
    if (response && !this.#disposed) {
      this.#post({ type: 'fs-response', response });
    }
  }

  #fail(error: Error): void {
    if (this.#failure !== undefined || this.#disposed) {
      return;
    }
    this.#failure = error;
    this.#ready.reject(error);
    this.#rejectAll(error);
    this.#onFatal?.(error);
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
