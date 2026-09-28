/**
 * Minimal port shape shared by the three message ports this protocol runs over,
 * plus the shims that normalize the two event-emitter flavours onto it.
 *
 * A browser `MessagePort` satisfies {@link NodeFsPort} as-is. Electron's
 * `MessagePortMain` and `node:worker_threads`' `MessagePort` both use the
 * Node `EventEmitter` API instead, so they are wrapped.
 *
 * Kept here rather than in `@taucad/runtime` because this library must not
 * import the runtime (import boundary). `packages/runtime`'s private
 * `wrapMessagePortMain` (`electron/electron-utility-host.ts`) is the same
 * shim; folding the two together needs a shared dependency-light home and is
 * recorded as follow-up debt, not done here.
 */

/**
 * The transport the node filesystem protocol runs over.
 * @public
 */
export type NodeFsPort = {
  postMessage(message: unknown): void;
  addEventListener(type: NodeFsPortEvent, listener: (event: { data: unknown }) => void): void;
  removeEventListener?(type: NodeFsPortEvent, listener: (event: { data: unknown }) => void): void;
  start?(): void;
  close?(): void;
};

/**
 * Events the channel subscribes to. `close` is how a dead host becomes visible:
 * the far end disentangles and every port flavour here reports it, which is the
 * only thing standing between a killed host and permanently pending requests.
 * @public
 */
export type NodeFsPortEvent = 'message' | 'close' | 'messageerror';

/** An `EventEmitter`-flavoured port (Electron `MessagePortMain`, `worker_threads`). @public */
export type EmitterPort = {
  postMessage(message: unknown): void;
  on(event: NodeFsPortEvent, listener: (message: unknown) => void): unknown;
  off?(event: NodeFsPortEvent, listener: (message: unknown) => void): unknown;
  start?(): void;
  close?(): void;
};

const isEmitterPort = (port: NodeFsPort | EmitterPort): port is EmitterPort =>
  typeof (port as Partial<NodeFsPort>).addEventListener !== 'function';

/**
 * Normalize any of the three supported ports onto {@link NodeFsPort}.
 *
 * Electron's `MessagePortMain` delivers `{ data }` envelopes to `on('message')`;
 * `worker_threads` delivers the bare payload. Both are handled: a payload that
 * is not an object carrying `data` is treated as the message itself.
 *
 * @param port - Browser, Electron-main, or worker_threads message port.
 * @returns The same port behind the browser-flavoured listener API.
 * @public
 */
export function toNodeFsPort(port: NodeFsPort | EmitterPort): NodeFsPort {
  if (!isEmitterPort(port)) {
    return port;
  }
  const wrappers = new Map<(event: { data: unknown }) => void, (message: unknown) => void>();
  return {
    postMessage: (message) => {
      port.postMessage(message);
    },
    addEventListener: (type, listener) => {
      const wrapper = (message: unknown): void => {
        // Electron wraps the payload in `{ data }`; `worker_threads` does not.
        // `close`/`messageerror` carry nothing either way.
        const envelope = message as { data?: unknown } | undefined;
        listener({ data: envelope?.data ?? message });
      };
      wrappers.set(listener, wrapper);
      port.on(type, wrapper);
    },
    removeEventListener: (type, listener) => {
      const wrapper = wrappers.get(listener);
      if (wrapper) {
        wrappers.delete(listener);
        port.off?.(type, wrapper);
      }
    },
    start: () => {
      port.start?.();
    },
    close: () => {
      port.close?.();
    },
  };
}
