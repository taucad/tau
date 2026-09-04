import { Topic } from '@taucad/events';

/**
 * Minimal bidirectional postMessage port, generic over the message payload shape.
 *
 * Three adapters map a concrete substrate onto this type: {@link wrapMessagePort}
 * for WHATWG-shaped ports (DOM `MessagePort`, `node:worker_threads`),
 * {@link wrapMessagePortMain} for the `EventEmitter`-shaped Electron
 * `MessagePortMain`, and {@link wrapWebSocket} for a byte wire plus a codec.
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
  /**
   * Optional: report the underlying port's own death — the far end
   * disentangled, which is what a killed peer looks like from here. Fires at
   * most once, and a handler registered after the fact fires immediately. The
   * returned unsubscribe is safe to call multiple times.
   *
   * A channel bound to a port that implements this closes with
   * `origin: 'remote'` when the port dies, so pending calls reject instead of
   * hanging forever. Absent on wires that cannot observe it.
   *
   * There is deliberately no `onError` companion: nothing in the tree treats
   * `messageerror` as distinct from death, so it would be a member with no
   * implementation and no caller.
   */
  onClose?(handler: () => void): () => void;
  close(): void;
};

/**
 * WHATWG-shaped `MessagePort` surface: the structural form of a DOM
 * `MessagePort`, a `node:worker_threads` `MessagePort`, or any in-process
 * object that speaks the same four methods. Listener and transfer
 * *parameters* are deliberately `any` so one type spans the DOM and Node
 * signatures — assert on member presence, never on parameter types.
 *
 * @public
 */
export type MessagePortLike = {
  // oxlint-disable-next-line typescript/no-explicit-any, typescript/explicit-module-boundary-types -- intentionally accept DOM MessagePort and node:worker_threads MessagePort
  postMessage(data: any, transfer?: any): void;
  // oxlint-disable-next-line typescript/no-explicit-any, typescript/explicit-module-boundary-types -- DOM uses EventListener, node uses (msg) => void
  addEventListener(type: 'close' | 'message', listener: any, options?: any): void;
  // oxlint-disable-next-line typescript/no-explicit-any, typescript/explicit-module-boundary-types -- mirror of addEventListener
  removeEventListener(type: 'close' | 'message', listener: any, options?: any): void;
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
export const wrapMessagePort = <T>(port: MessagePortLike, options?: { label?: string }): Port<T> => {
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
    onClose(handler: () => void): () => void {
      /* Both flavours fire `close` when the far end disentangles (DOM since
       * the `close` event shipped, `worker_threads` ports as EventTargets); a
       * port whose implementation never fires it simply never notifies. */
      let fired = false;
      const listener = (): void => {
        if (fired) {
          return;
        }
        fired = true;
        handler();
      };
      port.addEventListener('close', listener);
      return () => {
        port.removeEventListener('close', listener);
      };
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

/**
 * `EventEmitter`-shaped message port: the structural form of Electron's
 * `MessagePortMain`, or of a `node:worker_threads` `MessagePort` driven
 * through its emitter API. Listener and transfer *parameters* are deliberately
 * `any`, exactly as {@link MessagePortLike}'s are — assert on member presence,
 * never on parameter types.
 *
 * @public
 */
export type MessagePortMainLike = {
  // oxlint-disable-next-line typescript/no-explicit-any, typescript/explicit-module-boundary-types -- Electron types the transfer list as MessagePortMain[]
  postMessage(value: any, transfer?: any): void;
  // oxlint-disable-next-line typescript/no-explicit-any, typescript/explicit-module-boundary-types -- one signature spanning Electron's and worker_threads' per-event overloads
  on(event: 'close' | 'message', listener: any): unknown;
  // oxlint-disable-next-line typescript/no-explicit-any, typescript/explicit-module-boundary-types -- mirror of `on`; absent on some emitter ports
  off?(event: 'close' | 'message', listener: any): unknown;
  start(): void;
  close(): void;
};

/**
 * Structural probe for an Electron-transferable port. `MessagePortMain` is not
 * exposed as a constructor to renderer or utility code, so membership is
 * decided on shape — `postMessage` plus `start`, which no `ArrayBuffer` or
 * typed array has.
 */
const isTransferablePort = (entry: unknown): boolean =>
  entry !== null &&
  typeof entry === 'object' &&
  typeof (entry as { postMessage?: unknown }).postMessage === 'function' &&
  typeof (entry as { start?: unknown }).start === 'function';

/**
 * Adapts an `EventEmitter`-shaped {@link MessagePortMainLike} to {@link Port}.
 *
 * Four behaviours Electron's `MessagePortMain` makes mandatory, all measured:
 * - its transfer list is `MessagePortMain[]` and nothing else — an
 *   `ArrayBuffer` in it throws `Port at index N is not a valid port`, so
 *   non-port entries are dropped and the value is still posted. This wire
 *   copies by construction;
 * - `postMessage` after the far end disentangles is a no-op, so the channel's
 *   own bye frame cannot throw through a dead port;
 * - inbound payloads arrive as `{ data }` on Electron and bare on
 *   `worker_threads`; both are accepted, so one adapter spans the family;
 * - `start()` is deferred to the first `onMessage`, so no frame is delivered
 *   before a handler exists.
 *
 * @param port - The emitter-shaped port to wrap. This adapter owns its listeners and its close.
 * @param options - `label` is only used for `close` error messages.
 * @returns A {@link Port} bound to the given port.
 * @public
 */
export const wrapMessagePortMain = <T>(port: MessagePortMainLike, options?: { label?: string }): Port<T> => {
  const label = options?.label ?? 'MessagePortMain';
  const messages = new Topic<T>({ name: label });
  const deaths = new Topic<undefined>({ name: `${label}:close` });
  let started = false;
  let closed = false;

  /** The far end disentangled: go silent, then report it once. */
  const onDeath = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    messages.dispose();
    deaths.emit(undefined);
    deaths.dispose();
  };

  port.on('close', onDeath);

  return {
    postMessage(data: T, transfer?: readonly Transferable[]): void {
      if (closed) {
        return;
      }
      const ports = transfer?.filter((entry) => isTransferablePort(entry));
      if (ports && ports.length > 0) {
        port.postMessage(data, ports);
      } else {
        port.postMessage(data);
      }
    },
    onMessage(handler: (data: T) => void): () => void {
      const unsubscribe = messages.subscribe(handler);
      if (!started) {
        started = true;
        port.on('message', (message: unknown) => {
          /* Electron wraps the payload in `{ data }`; `worker_threads` does
           * not. A payload that is not an object carrying `data` is the
           * message itself. */
          const envelope = message as { data?: unknown } | undefined;
          messages.emit((envelope?.data ?? message) as T);
        });
        port.start();
      }
      return unsubscribe;
    },
    onClose(handler: () => void): () => void {
      if (closed) {
        handler();
        return (): void => undefined;
      }
      return deaths.subscribe(handler);
    },
    close(): void {
      if (closed) {
        return;
      }
      /* A local close is not a death report: `closed` silences the wire, but
       * the death handlers stay unfired — this side already knows. */
      closed = true;
      messages.dispose();
      deaths.dispose();
      try {
        port.close();
      } catch (error) {
        throw new Error(`${label} close failed`, { cause: error });
      }
    },
  };
};

/**
 * WHATWG-shaped `WebSocket` surface: the structural form of a browser
 * `WebSocket`, a Node `ws` socket, or any object speaking the same members.
 * Declared structurally (never as the concrete `WebSocket`/`ws` type) so
 * `@taucad/rpc` stays free of both DOM and Node socket dependencies.
 *
 * @public
 */
export type WebSocketLike = {
  readonly readyState: number;
  binaryType: string;
  send(data: Uint8Array<ArrayBuffer>): void;
  // oxlint-disable-next-line typescript/no-explicit-any, typescript/explicit-module-boundary-types -- DOM uses EventListener, `ws` uses per-event callbacks
  addEventListener(type: string, listener: any, options?: any): void;
  // oxlint-disable-next-line typescript/no-explicit-any, typescript/explicit-module-boundary-types -- mirror of addEventListener
  removeEventListener(type: string, listener: any, options?: any): void;
  close(code?: number, reason?: string): void;
};

/**
 * Byte codec used to carry {@link Port} frames over a byte-oriented wire.
 *
 * `encode` may return a view over a pooled buffer (msgpack does): consumers
 * must honour `byteOffset`/`byteLength` — `socket.send(view)` does — and
 * never reach for `.buffer`. `decode` must hand out owned bytes.
 *
 * @public
 */
export type Codec = {
  encode(value: unknown): Uint8Array<ArrayBuffer>;
  decode(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): unknown;
};

/** `WebSocket.OPEN`. */
const webSocketOpen = 1;
/** `WebSocket.CLOSING`; `CLOSED` is 3. */
const webSocketClosing = 2;
/** RFC 6455 close code for a frame the receiver cannot accept. */
const webSocketUnsupportedData = 1003;

/**
 * Adapts a {@link WebSocketLike} to {@link Port}, encoding every frame with `codec`.
 *
 * Three behaviours the socket makes mandatory, all measured:
 * - the inbound listener attaches here, at wrap time, and inbound frames are
 *   buffered until the first `onMessage` registers — a channel server posts its
 *   hello during construction, and a listener attached later never sees it;
 * - outbound frames are queued until the socket reports `OPEN`;
 * - `binaryType` is forced to `arraybuffer` (`ws` defaults to `nodebuffer`,
 *   browsers to `blob`, whose read is async while `Port.onMessage` is not).
 *
 * After the socket closes, `postMessage` is a no-op — the channel's own bye
 * frame races socket teardown and must not throw through it.
 *
 * @param socket - Socket to wrap. This adapter owns its listeners and its close.
 * @param codec - Frame codec; `decode` must hand out owned bytes.
 * @returns A {@link Port} bound to the given socket.
 * @public
 */
export const wrapWebSocket = <T>(socket: WebSocketLike, codec: Codec): Port<T> => {
  socket.binaryType = 'arraybuffer';

  const messages = new Topic<T>({ name: 'websocket' });
  const deaths = new Topic<void>({ name: 'websocket.close' });
  let deathReported = false;
  /** Inbound frames received before the first `onMessage`; `undefined` once flushed. */
  let inbound: T[] | undefined = [];
  /** Outbound frames encoded before `open`. */
  const outbound: Array<Uint8Array<ArrayBuffer>> = [];
  // A socket already CLOSING/CLOSED at wrap time will never emit `open` or
  // `close`; treating it as closed keeps `postMessage` from queueing forever.
  let closed = socket.readyState >= webSocketClosing;

  const onSocketMessage = (event: { readonly data: ArrayBuffer | Uint8Array<ArrayBuffer> }): void => {
    let data: T;
    try {
      data = codec.decode(event.data) as T;
    } catch {
      // A text or malformed frame from a peer must not throw out of a socket
      // listener (uncaught in Node); 1003 = unsupported data. The peer caused
      // it, so from here it is a death, not a local close.
      closeSocket(webSocketUnsupportedData, 'undecodable frame');
      reportDeath();
      return;
    }
    if (inbound) {
      inbound.push(data);
      return;
    }
    messages.emit(data);
  };

  const onSocketOpen = (): void => {
    for (const frame of outbound) {
      socket.send(frame);
    }
    outbound.length = 0;
  };

  /** Fire the death handlers at most once, however the wire died. */
  const reportDeath = (): void => {
    if (deathReported) {
      return;
    }
    deathReported = true;
    deaths.emit();
  };

  const onSocketClose = (): void => {
    closed = true;
    detach();
    reportDeath();
  };

  const detach = (): void => {
    socket.removeEventListener('message', onSocketMessage);
    socket.removeEventListener('open', onSocketOpen);
    socket.removeEventListener('close', onSocketClose);
  };

  const closeSocket = (code?: number, reason?: string): void => {
    if (closed) {
      return;
    }
    closed = true;
    detach();
    socket.close(code, reason);
  };

  socket.addEventListener('message', onSocketMessage);
  socket.addEventListener('open', onSocketOpen);
  socket.addEventListener('close', onSocketClose);

  return {
    postMessage(data: T): void {
      if (closed) {
        return;
      }
      const frame = codec.encode(data);
      if (socket.readyState === webSocketOpen) {
        socket.send(frame);
      } else {
        outbound.push(frame);
      }
    },
    onMessage(handler: (data: T) => void): () => void {
      const unsubscribe = messages.subscribe(handler);
      if (inbound) {
        // `inbound` stays live while draining: a frame that lands mid-drain is
        // appended and the array iterator delivers it in order, rather than
        // it jumping ahead through the topic. `finally` so a throwing handler
        // cannot leave the buffer armed for a second, duplicate drain.
        const draining = inbound;
        try {
          for (const data of draining) {
            handler(data);
          }
        } finally {
          inbound = undefined;
        }
      }
      return unsubscribe;
    },
    onClose(handler: () => void): () => void {
      /* Same contract as `wrapMessagePortMain`: the socket's own `close` is
       * the death report (a local `close()` detaches first, so it is not
       * one), and a socket already closed at wrap time reports immediately. */
      if (closed) {
        handler();
        return (): void => undefined;
      }
      return deaths.subscribe(handler);
    },
    close(): void {
      closeSocket();
    },
  };
};
