/**
 * Renderer-side half of the node filesystem backend.
 *
 * Runs inside the file-manager worker and forwards the 8 abstract provider
 * primitives to a host that owns `node:fs` (the Electron services utility, or
 * a plain Node peer in tests). Contains no `node:*` import by construction —
 * the browser barrel re-exports this file, so a stray one would drag `node:fs`
 * into the worker bundle.
 */

import type { z } from 'zod';
import { Topic } from '@taucad/events';
import { AbstractFileSystemProvider } from '#backend/abstract-provider.js';
import type { FileStat, ProviderCapabilities, WatchRequest } from '#types.js';
import type { NodeFsPort } from '#backend/node/port.js';
import type { NodeFsRequest, NodeFsResponse, NodeFsWatchEvent } from '#backend/node/protocol.js';
import {
  nodeFsProtocolVersion,
  nodeFsResponseSchema,
  nodeFsResultSchemas,
  parseNodeFsFrame,
} from '#backend/node/protocol.js';

type Pending = {
  readonly op: NodeFsRequest['op'];
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
};

/**
 * The channel to the filesystem host is gone — the host process died, or the
 * channel was disposed. Distinguishable on purpose: a caller can tell a dead
 * transport from a filesystem error (`ENOENT`, `EACCES`) and resync instead of
 * treating the root as broken.
 * @public
 */
export class NodeFsChannelClosedError extends Error {
  public override readonly name = 'NodeFsChannelClosedError';

  /** @param message - What closed the channel. */
  public constructor(message = 'The node filesystem channel is closed.') {
    super(message);
  }
}

const toError = (frame: Extract<NodeFsResponse, { type: 'error' }>): Error => {
  const error = new Error(frame.message);
  if (frame.code !== undefined) {
    (error as NodeJS.ErrnoException).code = frame.code;
  }
  return error;
};

/**
 * One multiplexed connection to a node filesystem host.
 *
 * A single port serves every node root: each request carries its `root`, which
 * is the rooted-view half of the process-seam contract (substrate invariant 1).
 * One port per concern, never a socket multiplexer.
 *
 * @public
 */
export class NodeFsChannel {
  private readonly _port: NodeFsPort;
  private readonly _pending = new Map<number, Pending>();
  private readonly _watchers = new Map<number, (event: NodeFsWatchEvent) => void>();
  private readonly _close = new Topic<void>({ name: 'NodeFsChannel.close' });
  private _nextId = 1;
  private _closed = false;

  /**
   * Bind a channel to an already-connected port.
   *
   * @param port - Transport to the host; a browser `MessagePort` works as-is,
   * other flavours go through `toNodeFsPort`.
   */
  public constructor(port: NodeFsPort) {
    this._port = port;
    port.addEventListener('message', (event) => {
      this._receive(event.data);
    });
    // A dead host is otherwise invisible: nothing settles the pending map and
    // every in-flight request hangs forever. The far end disentangling fires
    // `close` here; `messageerror` means the wire itself is unusable.
    for (const event of ['close', 'messageerror'] as const) {
      port.addEventListener(event, () => {
        this.close();
      });
    }
    port.start?.();
  }

  /** Whether the channel has been closed (host death or disposal). @returns `true` once closed. */
  public get closed(): boolean {
    return this._closed;
  }

  /**
   * Run `listener` when the channel closes, once. Callers that cache providers
   * bound to this channel use it to evict them.
   *
   * @param listener - Invoked on the single close transition.
   */
  public onClose(listener: () => void): void {
    if (this._closed) {
      listener();
      return;
    }
    this._close.subscribe(listener);
  }

  /**
   * Send one request and await its result.
   *
   * @param request - Request frame minus its version and id.
   * @returns The host's validated result for the requested operation.
   */
  public async request<Request extends Omit<NodeFsRequest, 'v' | 'id'>>(
    request: Request,
  ): Promise<z.infer<(typeof nodeFsResultSchemas)[Request['op']]>> {
    if (this._closed) {
      throw new NodeFsChannelClosedError();
    }
    const id = this._nextId++;
    return (await new Promise<unknown>((resolve, reject) => {
      this._pending.set(id, { op: request.op, resolve, reject });
      this._port.postMessage({ ...request, v: nodeFsProtocolVersion, id });
    })) as z.infer<(typeof nodeFsResultSchemas)[Request['op']]>;
  }

  /**
   * Subscribe to host-side watch events for `root`.
   *
   * Arming is asynchronous by construction: the watcher lives in another
   * process, so — unlike the runtime's in-process adapter, which arms
   * synchronously to close the subscribe-versus-read window — the caller must
   * await this promise before treating its own reads as watched.
   *
   * @param root - Absolute host directory the subscription is rooted at.
   * @param request - Paths (root-relative) and options to watch.
   * @param handler - Receives every event until the returned unsubscribe runs.
   * @returns Unsubscribe function once the host has armed; safe to call twice.
   */
  public async watch(
    root: string,
    request: WatchRequest,
    handler: (event: NodeFsWatchEvent) => void,
  ): Promise<() => void> {
    const id = this._nextId++;
    this._watchers.set(id, handler);
    const unsubscribe = (): void => {
      if (!this._watchers.delete(id) || this._closed) {
        return;
      }
      this._port.postMessage({ v: nodeFsProtocolVersion, id, op: 'unwatch' });
    };
    try {
      await new Promise<void>((resolve, reject) => {
        this._pending.set(id, {
          op: 'watch',
          resolve: () => {
            resolve();
          },
          reject,
        });
        this._port.postMessage({
          v: nodeFsProtocolVersion,
          id,
          root,
          op: 'watch',
          request: { paths: request.paths, recursive: request.recursive, excludes: request.excludes },
        });
      });
    } catch (error) {
      this._watchers.delete(id);
      throw error;
    }
    return unsubscribe;
  }

  /** Fail every in-flight request and stop accepting new ones. */
  public close(): void {
    if (this._closed) {
      return;
    }
    this._closed = true;
    for (const pending of this._pending.values()) {
      pending.reject(new NodeFsChannelClosedError('The node filesystem channel closed before the request settled.'));
    }
    this._pending.clear();
    for (const handler of this._watchers.values()) {
      handler({ type: 'reset' });
    }
    this._watchers.clear();
    this._port.close?.();
    this._close.emit();
  }

  private _receive(raw: unknown): void {
    let frame: NodeFsResponse;
    try {
      frame = parseNodeFsFrame(nodeFsResponseSchema, raw);
    } catch {
      // An unparseable frame is a host defect; dropping it is safer than
      // resolving a caller with an unvalidated value.
      return;
    }
    if (frame.type === 'watch') {
      this._watchers.get(frame.id)?.(frame.event);
      return;
    }
    const pending = this._pending.get(frame.id);
    if (!pending) {
      return;
    }
    this._pending.delete(frame.id);
    if (frame.type === 'error') {
      pending.reject(toError(frame));
      return;
    }
    const parsed = nodeFsResultSchemas[pending.op].safeParse(frame.value);
    if (parsed.success) {
      pending.resolve(parsed.data);
    } else {
      pending.reject(new Error(`The node filesystem host returned an invalid ${pending.op} result.`));
    }
  }
}

/**
 * `FileSystemProvider` over a {@link NodeFsChannel}, rooted at one host path.
 *
 * Derived operations (`exists`, `lstat`, recursive `mkdir`, `appendFile`) come
 * from {@link AbstractFileSystemProvider} so the node backend obeys the same
 * path-tree contract as every browser backend without a second implementation.
 *
 * ponytail: `lstat` therefore reports the target, not the link. Nothing in the
 * service distinguishes them today; forward a dedicated `lstat` op if that changes.
 *
 * @public
 */
export class NodeFsProviderClient extends AbstractFileSystemProvider {
  public readonly capabilities: ProviderCapabilities = {
    persistent: true,
    writable: true,
    quotaBased: false,
    durability: 'transactional-rewrite',
  };

  private readonly _channel: NodeFsChannel;
  private readonly _root: string;

  /**
   * @param channel - Shared connection to the host.
   * @param root - Absolute host directory this provider is rooted at.
   */
  public constructor(channel: NodeFsChannel, root: string) {
    super();
    this._channel = channel;
    this._root = root;
  }

  /**
   * Backend identifier, carrying the physical root so two node providers are
   * distinguishable in diagnostics.
   * @returns `node:<absolute host path>`.
   */
  public get id(): string {
    return `node:${this._root}`;
  }

  /** Absolute host directory this provider is rooted at. @returns The root path. */
  public get root(): string {
    return this._root;
  }

  public async writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
    this._assertRootedPath(path);
    await this._channel.request({ root: this._root, op: 'writeFile', path, data });
  }

  public async readdir(path: string): Promise<string[]> {
    this._assertRootedPath(path);
    return this._channel.request({ root: this._root, op: 'readdir', path });
  }

  public async stat(path: string): Promise<FileStat> {
    this._assertRootedPath(path);
    return this._channel.request({ root: this._root, op: 'stat', path });
  }

  public async unlink(path: string): Promise<void> {
    this._assertRootedPath(path);
    await this._channel.request({ root: this._root, op: 'unlink', path });
  }

  public async rmdir(path: string): Promise<void> {
    this._assertRootedPath(path);
    await this._channel.request({ root: this._root, op: 'rmdir', path });
  }

  public async rename(from: string, to: string): Promise<void> {
    this._assertRootedPath(from);
    this._assertRootedPath(to);
    await this._channel.request({ root: this._root, op: 'rename', from, to });
  }

  /**
   * Subscribe to host-side change events under this root.
   *
   * @param request - Root-relative paths and options to watch.
   * @param handler - Receives every event until the returned unsubscribe runs.
   * @returns Unsubscribe function, once the host has armed the watcher.
   */
  public async watch(request: WatchRequest, handler: (event: NodeFsWatchEvent) => void): Promise<() => void> {
    return this._channel.watch(this._root, request, handler);
  }

  protected async readFileRaw(path: string): Promise<Uint8Array<ArrayBuffer>> {
    return this._channel.request({ root: this._root, op: 'readFile', path });
  }

  protected async mkdirSingle(path: string): Promise<void> {
    await this._channel.request({ root: this._root, op: 'mkdir', path });
  }
}
