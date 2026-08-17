/**
 * Minimal bidirectional postMessage port, generic over the message payload shape.
 * Adapters map DOM `MessagePort`, Electron `MessagePortMain`, and similar APIs to this type.
 *
 * The adapter surface is deliberately narrow: every transport now declares
 * its delivery tier through the runtime transport plugin's fat shape
 * (`host.encodeGeometry` / `host.encodeFile` returns) rather than via a
 * per-port capability descriptor — channels remain transport-agnostic.
 *
 * @public
 */
export type Port<T> = {
  postMessage(data: T, transfer?: readonly Transferable[]): void;
  /**
   * Register an inbound message handler. Returns an unsubscribe that is safe to call multiple times.
   */
  onMessage(handler: (data: T) => void): () => void;
  /**
   * Optional: DOM `MessagePort` requires `start()` on the receiving side before events flow.
   */
  start?(): void;
  close(): void;
};

type AnyMessagePort = {
  // oxlint-disable-next-line typescript/no-explicit-any -- intentionally accept DOM MessagePort and node:worker_threads MessagePort
  postMessage(data: any, transfer?: any): void;
  // oxlint-disable-next-line typescript/no-explicit-any -- DOM uses EventListener, node uses (msg) => void
  addEventListener(type: 'message', listener: any, options?: any): void;
  // oxlint-disable-next-line typescript/no-explicit-any -- mirror of addEventListener
  removeEventListener(type: 'message', listener: any, options?: any): void;
  start?(): void;
  close(): void;
};

/**
 * Adapts a standard WHATWG `MessagePort` (or compatible Node `worker_threads` port) to {@link Port}.
 *
 * @param port - The port to wrap (typically from `new MessageChannel()` or `messageChannel.port2`).
 * @param options - `label` is only used for `close` error messages.
 * @returns A {@link Port} bound to the given `MessagePort`.
 * @public
 */
export const wrapMessagePort = <T>(port: AnyMessagePort, options?: { label?: string }): Port<T> => {
  const label = options?.label ?? 'MessagePort';
  return {
    postMessage(data: T, transfer?: readonly Transferable[]): void {
      port.postMessage(data, transfer);
    },
    onMessage(handler: (data: T) => void): () => void {
      const listener = (event: { data: T }): void => {
        handler(event.data);
      };
      port.addEventListener('message', listener);
      return () => {
        port.removeEventListener('message', listener);
      };
    },
    start(): void {
      port.start?.();
    },
    close(): void {
      try {
        port.close();
      } catch (error) {
        throw new Error(`${label} close failed`, { cause: error });
      }
    },
  };
};
