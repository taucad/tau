/**
 * Host half of the node filesystem backend: serves {@link NodeFsProvider}
 * rooted views over one port.
 *
 * Runs in the Electron services utility (or a plain Node peer in tests). The
 * renderer names the root it wants on every request, so `allowRoot` is the
 * trust boundary — without it a compromised renderer could name `/`.
 */

import type { NodeFsPort } from '#backend/node/port.js';
import type { NodeFsRequest, NodeFsResponse } from '#backend/node/protocol.js';
import { nodeFsProtocolVersion, nodeFsRequestSchema, parseNodeFsFrame } from '#backend/node/protocol.js';
import { NodeFsProvider } from '#backend/node/provider.js';

/** Options for {@link serveNodeFsProvider}. @public */
export type NodeFsHostOptions = {
  /**
   * Admission decision for a requested root. Required: it is the only thing
   * standing between a renderer-supplied string and the whole host filesystem.
   */
  allowRoot(root: string): boolean;
};

const errorFrame = (id: number, error: unknown): NodeFsResponse => ({
  v: nodeFsProtocolVersion,
  id,
  type: 'error',
  message: error instanceof Error ? error.message : String(error),
  ...((error as NodeJS.ErrnoException | undefined)?.code === undefined
    ? {}
    : { code: (error as NodeJS.ErrnoException).code }),
});

const runOperation = async (provider: NodeFsProvider, request: NodeFsRequest): Promise<unknown> => {
  switch (request.op) {
    case 'readFile': {
      return provider.readFile(request.path);
    }
    case 'writeFile': {
      return provider.writeFile(request.path, request.data);
    }
    case 'readdir': {
      return provider.readdir(request.path);
    }
    case 'stat': {
      return provider.stat(request.path);
    }
    case 'mkdir': {
      return provider.mkdir(request.path);
    }
    case 'unlink': {
      return provider.unlink(request.path);
    }
    case 'rmdir': {
      return provider.rmdir(request.path);
    }
    case 'rename': {
      return provider.rename(request.from, request.to);
    }
    default: {
      throw new Error(`Unhandled node filesystem operation: ${request.op}`);
    }
  }
};

/**
 * Serve node filesystem requests arriving on `port` until the returned
 * disposer runs.
 *
 * @param port - Transport to the renderer's file-manager worker.
 * @param options - Root admission policy.
 * @returns Disposer that drops every provider and watch subscription.
 * @public
 */
export function serveNodeFsProvider(port: NodeFsPort, options: NodeFsHostOptions): () => void {
  const providers = new Map<string, NodeFsProvider>();
  const subscriptions = new Map<number, () => void>();
  let disposed = false;

  const send = (response: NodeFsResponse): void => {
    if (!disposed) {
      port.postMessage(response);
    }
  };

  const providerFor = (root: string): NodeFsProvider => {
    // Admission is re-decided per request, before the cache: caching it would
    // make a narrowed allowlist (a workspace disconnected while the port stays
    // open) invisible for the life of the connection. One predicate call.
    if (!options.allowRoot(root)) {
      throw Object.assign(new Error(`Refusing to serve an unadmitted filesystem root: ${root}`), { code: 'EACCES' });
    }
    const existing = providers.get(root);
    if (existing) {
      return existing;
    }
    const provider = new NodeFsProvider(root);
    providers.set(root, provider);
    return provider;
  };

  const listener = (event: { data: unknown }): void => {
    let request: NodeFsRequest;
    try {
      request = parseNodeFsFrame(nodeFsRequestSchema, event.data);
    } catch (error) {
      const id = (event.data as { id?: unknown } | undefined)?.id;
      if (typeof id === 'number') {
        send(errorFrame(id, error));
      }
      return;
    }

    if (request.op === 'unwatch') {
      subscriptions.get(request.id)?.();
      subscriptions.delete(request.id);
      return;
    }

    if (request.op === 'watch') {
      try {
        const unsubscribe = providerFor(request.root).watch(request.request, (watchEvent) => {
          send({ v: nodeFsProtocolVersion, id: request.id, type: 'watch', event: watchEvent });
        });
        subscriptions.set(request.id, unsubscribe);
        send({ v: nodeFsProtocolVersion, id: request.id, type: 'result', value: undefined });
      } catch (error) {
        send(errorFrame(request.id, error));
      }
      return;
    }

    // async-iife: bootstrap — a port listener cannot be async; every outcome is a reply frame.
    void (async () => {
      try {
        send({
          v: nodeFsProtocolVersion,
          id: request.id,
          type: 'result',
          value: await runOperation(providerFor(request.root), request),
        });
      } catch (error) {
        send(errorFrame(request.id, error));
      }
    })();
  };

  port.addEventListener('message', listener);
  port.start?.();

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    port.removeEventListener?.('message', listener);
    for (const unsubscribe of subscriptions.values()) {
      unsubscribe();
    }
    subscriptions.clear();
    for (const provider of providers.values()) {
      provider.dispose();
    }
    providers.clear();
  };
}
