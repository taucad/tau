import { Topic } from '@taucad/events';
import { randomUuid } from '@taucad/utils/id';
import type { Port } from '#port.js';
import type {
  WireMessage,
  WireRequestCancel,
  WireBye,
  WireNotify,
  WireError,
  WireHello,
  WireResponse,
  WireStreamNext,
  WireStreamComplete,
  WireStreamError,
  WireVersionMismatchHandler,
} from '#wire.js';
import { isWireMessage } from '#wire.js';
import { WireValidationError } from '#wire-validation-error.js';
import type {
  WireProtocolSchemas,
  WireValidationIssue,
  WireValidationSite,
  WireValidator,
} from '#wire-validation-error.js';

type ValidateWireFrameInput = {
  validator: WireValidator | undefined;
  site: WireValidationSite;
  entry: string;
  payload: unknown;
};

/**
 * Validate a payload against an optional {@link WireValidator}.
 *
 * Returns the parsed value on success and throws a
 * {@link WireValidationError} on failure. When the validator is absent
 * the payload passes through untouched.
 *
 * @param input - Frame validation inputs (validator, site, entry, payload).
 * @returns The validator's parsed `data` on success or the raw `payload` when no validator is bound.
 */
const validateWireFrame = (input: ValidateWireFrameInput): unknown => {
  const { validator, site, entry, payload } = input;
  if (!validator) {
    return payload;
  }
  const outcome = validator.safeParse(payload);
  if (outcome.success) {
    return outcome.data;
  }
  const issues: readonly WireValidationIssue[] = outcome.error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
  }));
  throw new WireValidationError(site, entry, issues);
};

/**
 * One logical RPC session. Included in public APIs for future per-call metadata; v1 is empty.
 *
 * @public
 */
export type ChannelContext = {
  readonly sessionKey: string;
};

/**
 * Envelope for binary payloads that need zero-copy transfer over a {@link Port}.
 *
 * Wrap call args, call return values, notify args, and stream values in this shape when the
 * underlying transport supports `Transferable[]`. Channel implementations strip the envelope on
 * the wire and hoist `transferables` onto the second argument of `port.postMessage`.
 *
 * @public
 */
export type WithTransferables<T> = {
  readonly value: T;
  readonly transferables: readonly Transferable[];
};

const isWithTransferables = (value: unknown): value is WithTransferables<unknown> => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const o = value as { value?: unknown; transferables?: unknown };
  return 'value' in o && 'transferables' in o && Array.isArray(o.transferables);
};

const unwrapTransferables = (payload: unknown): { value: unknown; transfer: readonly Transferable[] | undefined } => {
  if (isWithTransferables(payload)) {
    return { value: payload.value, transfer: payload.transferables };
  }
  return { value: payload, transfer: undefined };
};

/**
 * Typed RPC protocol contract carried as a phantom type parameter on {@link Channel} and
 * {@link ChannelServer}. Each member describes the args/return/event shape for one operation.
 *
 * @public
 */
export type RpcProtocol = {
  readonly hello?: unknown;
  readonly calls: Readonly<Record<string, { args: unknown; result: unknown }>>;
  readonly notifies: Readonly<Record<string, { args: unknown }>>;
  readonly listens: Readonly<Record<string, { args: unknown; event: unknown }>>;
};

/**
 * Permissive default protocol used when consumers haven't declared a typed contract. Lets
 * `Channel`/`ChannelServer` accept arbitrary call/notify/listen names with `unknown` args and
 * `unknown` results. Migrating consumers should declare a narrower {@link RpcProtocol}.
 *
 * @public
 */
export type EmptyRpcProtocol = RpcProtocol;

type CallNames<P extends RpcProtocol> = keyof P['calls'] & string;
type NotifyNames<P extends RpcProtocol> = keyof P['notifies'] & string;
type ListenNames<P extends RpcProtocol> = keyof P['listens'] & string;
type CallArgs<P extends RpcProtocol, N extends CallNames<P>> = P['calls'][N]['args'];
type CallResult<P extends RpcProtocol, N extends CallNames<P>> = P['calls'][N]['result'];
type NotifyArgs<P extends RpcProtocol, N extends NotifyNames<P>> = P['notifies'][N]['args'];
type ListenArgs<P extends RpcProtocol, N extends ListenNames<P>> = P['listens'][N]['args'];
type ListenEvent<P extends RpcProtocol, N extends ListenNames<P>> = P['listens'][N]['event'];
type ProtocolHello<P extends RpcProtocol> = P extends { readonly hello: infer Hello } ? Hello : unknown;

/**
 * Information passed to `onClose` listeners. `origin` indicates which side initiated the close,
 * and `reason` carries the optional human-readable reason from the lifecycle bye frame.
 *
 * @public
 */
export type CloseInfo = {
  readonly origin: 'local' | 'remote' | 'timeout';
  readonly reason?: string;
};

/**
 * Client-side: invoke remote procedures, send notifications, and subscribe to event streams.
 *
 * @public
 */
export type Channel<P extends RpcProtocol = EmptyRpcProtocol> = {
  /** Resolves once the server's `lh` (hello) frame has been received. Pre-ready calls queue. */
  readonly ready: Promise<void>;
  /** Resolves once the channel is fully closed (remote ack or timeout fallback). */
  readonly closed: Promise<void>;
  /**
   * The bound transport port. Exposed so transport plugins can attach
   * additional listeners or close hooks without smuggling the port
   * reference around their dependency graph.
   */
  readonly port: Port<unknown>;
  /**
   * Server hello payload (`lh.d`). Populated atomically with `ready` resolution;
   * consumers must `await channel.ready` before reading. Carries the server's
   * advertised capability set in the handshake.
   */
  readonly hello: { readonly payload: ProtocolHello<P> };
  /**
   * Invoke a remote procedure. With a typed {@link RpcProtocol}, `args` and the resolved
   * type are inferred by name. With the default {@link EmptyRpcProtocol} the result is
   * `unknown`; cast at the call site or supply a narrower protocol.
   */
  call<N extends CallNames<P>>(
    name: N,
    args?: CallArgs<P, N> | WithTransferables<CallArgs<P, N>>,
    signal?: AbortSignal,
  ): Promise<CallResult<P, N>>;
  /** Send a fire-and-forget notification. */
  notify<N extends NotifyNames<P>>(name: N, args?: NotifyArgs<P, N> | WithTransferables<NotifyArgs<P, N>>): void;
  /**
   * Register a notification handler. Returns an unsubscribe.
   * Multiple handlers per name are supported and all fire in registration order.
   */
  onNotify<N extends NotifyNames<P>>(name: N, handler: (args: NotifyArgs<P, N>) => void): () => void;
  /**
   * Subscribe to a server-pushed stream. With a typed {@link RpcProtocol}, `args` and the
   * yielded event type are inferred by name. With the default {@link EmptyRpcProtocol} the
   * yielded value is `unknown`; cast at the call site or supply a narrower protocol.
   */
  listen<N extends ListenNames<P>>(
    event: N,
    args?: ListenArgs<P, N> | WithTransferables<ListenArgs<P, N>>,
    signal?: AbortSignal,
  ): AsyncIterable<ListenEvent<P, N>>;
  /** Send the close (`lb`) control message and tear down local state. Idempotent. */
  close(reason?: string): void;
  /** Subscribe to the close event. Fires exactly once. Returns an unsubscribe. */
  onClose(handler: (info: CloseInfo) => void): () => void;
};

/**
 * Server-side handler implementation. Type-parameterised by the same {@link RpcProtocol} as the
 * matching client.
 *
 * @public
 */
export type ChannelServer<P extends RpcProtocol = EmptyRpcProtocol> = {
  call<N extends CallNames<P>>(
    context: ChannelContext,
    name: N,
    args: CallArgs<P, N>,
    signal: AbortSignal,
  ): Promise<CallResult<P, N> | WithTransferables<CallResult<P, N>>>;
  notify?<N extends NotifyNames<P>>(context: ChannelContext, name: N, args: NotifyArgs<P, N>): void;
  listen<N extends ListenNames<P>>(
    context: ChannelContext,
    event: N,
    args: ListenArgs<P, N>,
    signal: AbortSignal,
  ):
    | AsyncIterable<ListenEvent<P, N> | WithTransferables<ListenEvent<P, N>>>
    | Promise<AsyncIterable<ListenEvent<P, N> | WithTransferables<ListenEvent<P, N>>>>;
};

/**
 * Options for {@link createChannelClient}.
 *
 * @public
 */
export type ChannelClientOptions<P extends RpcProtocol = EmptyRpcProtocol> = {
  port: Port<unknown>;
  sessionKey: string;
  /**
   * Fallback timeout for the symmetric close handshake. Defaults to 5000ms.
   * After sending the close frame, the channel waits this long for a remote ack.
   */
  closeTimeout?: number;
  /**
   * Optional Zod-shape validators for per-call/per-notify validation at
   * the wire boundary. When supplied, the channel parses every received
   * call result and notify args payload before delivering to the
   * caller. Validation failures throw a {@link WireValidationError}
   * with the underlying issue list.
   *
   * Omit to trust the wire (used for transports within the same trust
   * boundary, e.g. in-process for tests).
   */
  protocolSchemas?: WireProtocolSchemas<P>;
};

/**
 * Options for {@link createChannelServer}.
 *
 * @public
 */
type ChannelServerOptionsBase<P extends RpcProtocol> = {
  port: Port<unknown>;
  sessionKey: string;
  impl: ChannelServer<P>;
  /** Fallback timeout for the symmetric close handshake. Defaults to 5000ms. */
  closeTimeout?: number;
  /**
   * Optional Zod-shape validators for per-call/per-notify validation at
   * the wire boundary. When supplied, the server parses every received
   * call args and notify args payload before invoking the handler.
   * Validation failures propagate to the caller as a typed `rs/se`
   * error frame carrying a {@link WireValidationError} message.
   *
   * Omit to trust the wire (used for transports within the same trust
   * boundary, e.g. in-process for tests).
   */
  protocolSchemas?: WireProtocolSchemas<P>;
};

type ChannelServerHelloOption<P extends RpcProtocol> = P extends { readonly hello: infer Hello }
  ? { readonly hello: Hello }
  : { readonly hello?: unknown };

export type ChannelServerOptions<P extends RpcProtocol = EmptyRpcProtocol> = ChannelServerOptionsBase<P> &
  ChannelServerHelloOption<P>;

/**
 * Server handle returned by {@link createChannelServer}.
 *
 * @public
 */
export type ChannelServerHandle<P extends RpcProtocol = EmptyRpcProtocol> = {
  /** Resolves once the server is fully closed (remote ack or timeout fallback). */
  readonly closed: Promise<void>;
  /** Send the close control message and tear down local state. Idempotent. */
  dispose(reason?: string): void;
  /** Subscribe to the close event. Returns an unsubscribe. */
  onClose(handler: (info: CloseInfo) => void): () => void;
  /**
   * Server-initiated notify (`nt` frame) for autonomous events such as progress,
   * geometry, or state transitions. Transferables are hoisted via the same
   * {@link WithTransferables} walker used by the client side.
   */
  notify<N extends NotifyNames<P>>(name: N, args?: NotifyArgs<P, N> | WithTransferables<NotifyArgs<P, N>>): void;
};

const createId: () => string = () => randomUuid();

const toWireError = (error: unknown): WireError => {
  if (error instanceof Error) {
    const { code } = error as { code?: unknown };
    return {
      m: error.message,
      ...(typeof code === 'string' || typeof code === 'number' ? { c: code } : {}),
      ...(typeof error.stack === 'string' ? { s: error.stack } : {}),
    };
  }
  return { m: String(error) };
};

const fromWireError = (error: WireError): Error => {
  const out = new Error(error.m);
  if (error.c !== undefined) {
    (out as { code?: string | number }).code = error.c;
  }
  if (error.s !== undefined) {
    out.stack = error.s;
  }
  return out;
};

type PendingCall = {
  resolve: (v: unknown) => void;
  reject: (reason: unknown) => void;
  cleanup: () => void;
};

const listenEnd = Symbol('listenEnd');
const listenFail = Symbol('listenFail');

const isObjectLike = (value: unknown): value is Record<PropertyKey, unknown> =>
  value !== null && (typeof value === 'object' || typeof value === 'function');

const resolveListenIterable = async (result: unknown): Promise<AsyncIterable<unknown>> => {
  if (isObjectLike(result) && Symbol.asyncIterator in result) {
    return result as unknown as AsyncIterable<unknown>;
  }
  return result as Promise<AsyncIterable<unknown>>;
};

const defaultCloseTimeout = 5000;

/**
 * Widened call/listen/notify handler shapes used internally by the server dispatch loop. They
 * mirror the public {@link ChannelServer} method signatures but drop protocol narrowing so the
 * wire frame's `string` name and `unknown` args can flow through. The rest-tuple form keeps the
 * positional shape readable while collapsing to a single rest parameter — `max-params` only
 * inspects formal parameter count, not tuple arity.
 */
type WidenedCallImpl = (
  ...args: [context: ChannelContext, name: string, args: unknown, signal: AbortSignal]
) => Promise<unknown>;
type WidenedListenImpl = (
  ...args: [context: ChannelContext, event: string, args: unknown, signal: AbortSignal]
) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>;
type WidenedNotifyImpl = (...args: [context: ChannelContext, name: string, args: unknown]) => void;

type CloseOrigin = 'local' | 'remote' | 'timeout';

type CloseController = {
  readonly closed: Promise<void>;
  onClose: (handler: (info: CloseInfo) => void) => () => void;
  initiateLocal: (reason?: string) => void;
  acceptRemote: (reason?: string) => void;
  isClosed: () => boolean;
};

const createCloseController = (options: {
  postClose: (reason?: string) => void;
  onTeardown: (origin: CloseOrigin) => void;
  onFinalize: (origin: CloseOrigin) => void;
  closeHandshakeTimeout: number;
}): CloseController => {
  const { postClose, onTeardown, onFinalize, closeHandshakeTimeout } = options;
  const closeTopic = new Topic<CloseInfo>({ name: 'rpc-close', onError: () => undefined });
  let resolved = false;
  let teardownDone = false;
  let resolveClosed: () => void = (): void => undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  let localSent = false;
  let remoteSeen = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let storedReason: string | undefined;

  const teardownOnce = (origin: CloseOrigin): void => {
    if (teardownDone) {
      return;
    }
    teardownDone = true;
    onTeardown(origin);
  };

  const finalize = (origin: CloseOrigin): void => {
    if (resolved) {
      return;
    }
    resolved = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    teardownOnce(origin);
    onFinalize(origin);
    const info: CloseInfo = storedReason === undefined ? { origin } : { origin, reason: storedReason };
    closeTopic.emit(info);
    closeTopic.dispose();
    resolveClosed();
  };

  const armTimer = (): void => {
    timer = setTimeout(() => {
      finalize('timeout');
    }, closeHandshakeTimeout);
    const maybeUnref = (timer as { unref?: () => void }).unref;
    if (typeof maybeUnref === 'function') {
      maybeUnref.call(timer);
    }
  };

  return {
    closed,
    onClose(handler) {
      if (resolved) {
        try {
          const info: CloseInfo =
            storedReason === undefined ? { origin: 'local' } : { origin: 'local', reason: storedReason };
          handler(info);
        } catch {
          // Ignore listener errors.
        }
        return (): void => undefined;
      }
      return closeTopic.subscribe(handler);
    },
    initiateLocal(reason) {
      if (localSent) {
        return;
      }
      localSent = true;
      if (reason !== undefined) {
        storedReason = reason;
      }
      teardownOnce('local');
      try {
        postClose(reason);
      } catch {
        finalize('timeout');
        return;
      }
      if (remoteSeen) {
        finalize('local');
        return;
      }
      armTimer();
    },
    acceptRemote(reason) {
      if (remoteSeen) {
        return;
      }
      remoteSeen = true;
      if (reason !== undefined && storedReason === undefined) {
        storedReason = reason;
      }
      if (localSent) {
        finalize('local');
        return;
      }
      localSent = true;
      teardownOnce('remote');
      try {
        postClose(reason);
      } catch {
        // Best-effort echo; ignore.
      }
      finalize('remote');
    },
    isClosed() {
      return resolved || teardownDone;
    },
  };
};

/* ============================================================================ *
 * Reserved flow-control logging                                                *
 * ============================================================================ */

let flowAckWarned = false;
let flowWindowWarned = false;
const warnFlowAckOnce = (): void => {
  if (flowAckWarned) {
    return;
  }
  flowAckWarned = true;
  console.warn('[@taucad/rpc] flow-ack frame received; flow control is reserved for a future revision and ignored');
};
const warnFlowWindowOnce = (): void => {
  if (flowWindowWarned) {
    return;
  }
  flowWindowWarned = true;
  console.warn('[@taucad/rpc] flow-window frame received; flow control is reserved for a future revision and ignored');
};

const createWireVersionMismatchReporter = (): WireVersionMismatchHandler => {
  let warned = false;
  return ({ expected, received, kind }) => {
    if (warned) {
      return;
    }
    warned = true;
    console.warn(
      `[@taucad/rpc] wire version mismatch: expected ${expected}, received ${String(received)} for "${kind}"; frame dropped`,
    );
  };
};

const createUnknownNotifyReporter = (receiver: 'client' | 'server'): ((name: string) => void) => {
  const warned = new Set<string>();
  return (name) => {
    if (warned.has(name)) {
      return;
    }
    warned.add(name);
    console.warn(`[@taucad/rpc] unknown notify "${name}" received by ${receiver}; frame dropped`);
  };
};

/**
 * Test-only: reset the once-warned flags so each test sees a fresh log.
 *
 * @internal
 * @public
 */
export const __resetFlowControlWarnings = (): void => {
  flowAckWarned = false;
  flowWindowWarned = false;
};

/**
 * Passthrough for {@link createChannelClient} options; keeps literal parameter types in signatures.
 *
 * @param config - Channel client options to validate and pass through.
 * @returns The same `config` reference, narrowed to its literal type.
 * @public
 */
export const createChannelClientOptions = <
  P extends RpcProtocol = EmptyRpcProtocol,
  T extends ChannelClientOptions<P> = ChannelClientOptions<P>,
>(
  config: T,
): T => config;

/**
 * Passthrough for {@link createChannelServer} options; keeps literal parameter types in signatures.
 *
 * @param config - Channel server options to validate and pass through.
 * @returns The same `config` reference, narrowed to its literal type.
 * @public
 */
export const createChannelServerOptions = <P extends RpcProtocol, T extends ChannelServerOptions<P>>(config: T): T =>
  config;

/**
 * Create an RPC client over a {@link Port}. Resolves {@link Channel.ready} after the server's
 * hello frame is observed; calls made before `ready` are queued.
 *
 * @param options - Channel client construction options (port, sessionKey, optional schemas, ...).
 * @returns A typed {@link Channel} bound to the supplied port.
 * @public
 */
export const createChannelClient = <P extends RpcProtocol = EmptyRpcProtocol>(
  options: ChannelClientOptions<P>,
): Channel<P> => {
  const { port, sessionKey: _sessionKey, closeTimeout = defaultCloseTimeout, protocolSchemas } = options;
  void _sessionKey;
  /**
   * Pending-call book maps id → name so the response handler can look
   * up the originating call name for client-side result validation.
   */
  const callPendingNames = new Map<string, string>();
  const callPending = new Map<string, PendingCall>();
  const listenSinks = new Map<
    string,
    { name: string; push: (v: unknown) => void; fail: (error: Error) => void; cleanup: () => void }
  >();
  const notifyTopics = new Map<string, Topic<unknown>>();
  type PendingFrame = { frame: WireMessage; transfer?: readonly Transferable[] };
  const sendQueue: PendingFrame[] = [];
  const reportWireVersionMismatch = createWireVersionMismatchReporter();
  const reportUnknownNotify = createUnknownNotifyReporter('client');

  let isReady = false;
  let resolveReady: () => void = (): void => undefined;
  let rejectReady: (reason: Error) => void = (): void => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // async-iife: bootstrap — silence unhandledrejection when consumers never await ready;
  // the public `ready` promise itself remains unwrapped so consumers can handle errors.
  void (async (): Promise<void> => {
    try {
      await ready;
    } catch {
      // Drop: consumer is responsible for catching errors via the public `ready` promise.
    }
  })();
  // Captured atomically with `isReady = true`; readers must `await ready`.
  let helloPayload: ProtocolHello<P>;
  const hello = {
    get payload(): ProtocolHello<P> {
      return helloPayload;
    },
  };

  const post = (frame: WireMessage, transfer?: readonly Transferable[]): void => {
    if (!isReady) {
      sendQueue.push({ frame, transfer });
      return;
    }
    port.postMessage(frame, transfer);
  };

  const flushSendQueue = (): void => {
    while (sendQueue.length > 0) {
      const item = sendQueue.shift()!;
      port.postMessage(item.frame, item.transfer);
    }
  };

  const handleHelloFrame = (frame: WireHello): void => {
    if (isReady) {
      return;
    }
    if (frame.o === 1) {
      try {
        helloPayload = validateWireFrame({
          validator: protocolSchemas?.hello,
          site: 'client-hello',
          entry: 'hello',
          payload: frame.d,
        }) as ProtocolHello<P>;
      } catch (validationError) {
        rejectReady(validationError instanceof Error ? validationError : new Error(String(validationError)));
        closeController.initiateLocal('hello-error');
        return;
      }
      isReady = true;
      resolveReady();
      flushSendQueue();
      return;
    }
    rejectReady(fromWireError(frame.e));
    closeController.initiateLocal('hello-error');
  };

  const handleResponseFrame = (frame: WireResponse): void => {
    const p = callPending.get(frame.i);
    if (!p) {
      return;
    }
    const callName = callPendingNames.get(frame.i);
    callPending.delete(frame.i);
    callPendingNames.delete(frame.i);
    if (frame.o === 0) {
      p.reject(fromWireError(frame.e));
      return;
    }
    try {
      const validated = validateWireFrame({
        validator: callName ? protocolSchemas?.calls[callName as keyof P['calls']]?.result : undefined,
        site: 'client-call-result',
        entry: callName ?? '<unknown>',
        payload: frame.d,
      });
      p.resolve(validated);
    } catch (validationError) {
      p.reject(validationError);
    }
  };

  const handleStreamFrame = (frame: WireStreamNext | WireStreamComplete | WireStreamError): void => {
    const sink = listenSinks.get(frame.i);
    if (!sink) {
      return;
    }
    if (frame.k === 'sn') {
      try {
        const validated = validateWireFrame({
          validator: protocolSchemas?.listens[sink.name as keyof P['listens']]?.event,
          site: 'client-listen-event',
          entry: sink.name,
          payload: frame.d,
        });
        sink.push(validated);
      } catch (validationError) {
        sink.fail(validationError instanceof Error ? validationError : new Error(String(validationError)));
      }
      return;
    }
    listenSinks.delete(frame.i);
    if (frame.k === 'sc') {
      sink.push(listenEnd);
      return;
    }
    sink.fail(fromWireError(frame.e));
  };

  const handleNotifyFrame = (frame: WireNotify): void => {
    if (protocolSchemas && !Object.hasOwn(protocolSchemas.notifies, frame.n)) {
      reportUnknownNotify(frame.n);
      return;
    }
    const topic = notifyTopics.get(frame.n);
    if (!topic) {
      return;
    }
    let payload: unknown;
    try {
      payload = validateWireFrame({
        validator: protocolSchemas?.notifies[frame.n as keyof P['notifies']],
        site: 'client-notify-args',
        entry: frame.n,
        payload: frame.a,
      });
    } catch {
      /* Drop frames that fail wire validation on the client side —
       * notifies are fire-and-forget so there is no caller to reject.
       * Validation errors on a hot loop would otherwise spam the
       * console; consumers wanting strict enforcement should use a
       * call instead. */
      return;
    }
    topic.emit(payload);
  };

  const onWire = (raw: unknown): void => {
    if (!isWireMessage(raw, reportWireVersionMismatch)) {
      return;
    }
    switch (raw.k) {
      case 'lh': {
        handleHelloFrame(raw);
        return;
      }
      case 'rs': {
        handleResponseFrame(raw);
        return;
      }
      case 'sn':
      case 'sc':
      case 'se': {
        handleStreamFrame(raw);
        return;
      }
      case 'nt': {
        handleNotifyFrame(raw);
        return;
      }
      case 'lb': {
        closeController.acceptRemote(raw.r);
        return;
      }
      case 'fa': {
        warnFlowAckOnce();
        return;
      }
      case 'fw': {
        warnFlowWindowOnce();
        break;
      }
      // Unhandled known kinds (rq/rc/ss/su) for client side: drop.
      default:
    }
  };

  let off: () => void = (): void => undefined;

  const cleanupPendingState = (origin: CloseOrigin): void => {
    for (const [, p] of callPending) {
      p.reject(new Error('Channel closed'));
    }
    callPending.clear();
    callPendingNames.clear();
    for (const [sid, s] of listenSinks) {
      if (origin === 'local') {
        s.fail(new Error('Channel closed'));
      } else {
        s.push(listenEnd);
      }
      listenSinks.delete(sid);
    }
    sendQueue.length = 0;
    if (!isReady) {
      rejectReady(new Error('Channel closed before ready'));
    }
  };

  const closeController = createCloseController({
    postClose: (reason) => {
      const frame: WireBye = reason === undefined ? { v: 1, k: 'lb' } : { v: 1, k: 'lb', r: reason };
      port.postMessage(frame);
    },
    onTeardown: (origin) => {
      cleanupPendingState(origin);
    },
    onFinalize: () => {
      off();
    },
    closeHandshakeTimeout: closeTimeout,
  });

  off = port.onMessage(onWire);
  if (port.start) {
    port.start();
  }

  const ensureOpen = (): void => {
    if (closeController.isClosed()) {
      throw new Error('Channel is closed');
    }
  };

  return {
    ready,
    get closed() {
      return closeController.closed;
    },
    port,
    hello,

    call: (async (name: CallNames<P>, args?: unknown, signal?: AbortSignal): Promise<unknown> => {
      ensureOpen();
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      const id = createId();
      return new Promise<unknown>((resolve, reject) => {
        const onAbort = (): void => {
          if (callPending.has(id)) {
            const cancelFrame: WireRequestCancel = { v: 1, k: 'rc', i: id, e: { m: 'aborted' } };
            try {
              port.postMessage(cancelFrame);
            } catch {
              // Port already torn down; rejection below handles it.
            }
          }
          const pending = callPending.get(id);
          callPending.delete(id);
          callPendingNames.delete(id);
          pending?.cleanup();
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        if (signal) {
          signal.addEventListener('abort', onAbort, { once: true });
        }
        const cleanup = (): void => {
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
        };
        callPendingNames.set(id, name);
        callPending.set(id, {
          cleanup,
          resolve: (v) => {
            cleanup();
            resolve(v);
          },
          reject: (reason) => {
            cleanup();
            reject(reason instanceof Error ? reason : new Error(String(reason)));
          },
        });
        const { value, transfer } = unwrapTransferables(args);
        post({ v: 1, k: 'rq', i: id, n: name, a: value ?? null }, transfer);
      });
    }) as Channel<P>['call'],

    notify<N extends NotifyNames<P>>(name: N, args?: NotifyArgs<P, N> | WithTransferables<NotifyArgs<P, N>>): void {
      ensureOpen();
      const { value, transfer } = unwrapTransferables(args);
      const frame: WireNotify = { v: 1, k: 'nt', n: name, a: value ?? null };
      post(frame, transfer);
    },

    onNotify<N extends NotifyNames<P>>(name: N, handler: (args: NotifyArgs<P, N>) => void): () => void {
      const topic =
        notifyTopics.get(name) ?? new Topic<unknown>({ name: `rpc-notify:${name}`, onError: () => undefined });
      notifyTopics.set(name, topic);
      const unsubscribe = topic.subscribe(handler as (args: unknown) => void);
      return () => {
        unsubscribe();
        if (topic.size === 0) {
          topic.dispose();
          notifyTopics.delete(name);
        }
      };
    },

    listen: async function* runListen(event: ListenNames<P>, args?: unknown, signal?: AbortSignal): AsyncGenerator {
      ensureOpen();
      const subId = createId();
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      const values: unknown[] = [];
      const waiters: Array<(v: unknown) => void> = [];
      let failError: Error | undefined;

      const waitNext = async (): Promise<unknown> => {
        if (values.length > 0) {
          return values.shift()!;
        }
        return new Promise<unknown>((resolve) => {
          waiters.push(resolve);
        });
      };

      const deliver = (v: unknown): void => {
        if (waiters.length > 0) {
          const w = waiters.shift()!;
          w(v);
        } else {
          values.push(v);
        }
      };

      const onListenAbort = (): void => {
        if (listenSinks.has(subId)) {
          try {
            port.postMessage({ v: 1, k: 'su', i: subId });
          } catch {
            // Port torn down: nothing to send.
          }
        }
        listenSinks.delete(subId);
        failError = new DOMException('The operation was aborted.', 'AbortError');
        deliver(listenFail);
      };

      const sink = {
        name: event,
        push: (v: unknown): void => {
          deliver(v);
        },
        fail: (error: Error): void => {
          failError = error;
          deliver(listenFail);
        },
        cleanup: (): void => {
          if (signal) {
            signal.removeEventListener('abort', onListenAbort);
          }
        },
      };

      if (signal) {
        signal.addEventListener('abort', onListenAbort, { once: true });
      }
      listenSinks.set(subId, sink);
      const { value: listenArgs, transfer: listenTransfer } = unwrapTransferables(args);
      post({ v: 1, k: 'ss', i: subId, n: event, a: listenArgs ?? null }, listenTransfer);

      try {
        // oxlint-disable-next-line no-constant-condition -- event loop until end/fail/return
        for (;;) {
          // oxlint-disable-next-line no-await-in-loop -- async generator requires sequential awaits
          const v = await waitNext();
          if (v === listenEnd) {
            return;
          }
          if (v === listenFail) {
            throw failError ?? new Error('listen failed');
          }
          yield v;
        }
      } finally {
        if (listenSinks.has(subId)) {
          listenSinks.delete(subId);
          if (!signal?.aborted) {
            try {
              port.postMessage({ v: 1, k: 'su', i: subId });
            } catch {
              // Best-effort.
            }
          }
        }
        sink.cleanup();
      }
    } as Channel<P>['listen'],

    close(reason?: string): void {
      closeController.initiateLocal(reason);
    },

    onClose(handler) {
      return closeController.onClose(handler);
    },
  };
};

/**
 * Create an RPC server on a {@link Port}. Emits a hello (`lh`) frame as soon as the port is wired
 * so the matching client can resolve {@link Channel.ready}.
 *
 * @param options - Channel server construction options (port, sessionKey, impl, ...).
 * @returns A handle that exposes `dispose`, `notify`, and the close lifecycle.
 * @public
 */
export const createChannelServer = <P extends RpcProtocol = EmptyRpcProtocol>(
  options: ChannelServerOptions<P>,
): ChannelServerHandle<P> => {
  const { port, sessionKey, impl, hello, closeTimeout = defaultCloseTimeout, protocolSchemas } = options;
  const context: ChannelContext = { sessionKey };
  const inFlightCalls = new Map<string, AbortController>();
  const inFlightStreams = new Map<string, AbortController>();
  const reportWireVersionMismatch = createWireVersionMismatchReporter();
  const reportUnknownNotify = createUnknownNotifyReporter('server');

  const onWire = (raw: unknown): void => {
    if (!isWireMessage(raw, reportWireVersionMismatch)) {
      return;
    }
    if (raw.k === 'rq') {
      const id = raw.i;
      let validatedArgs: unknown;
      try {
        validatedArgs = validateWireFrame({
          validator: protocolSchemas?.calls[raw.n as keyof P['calls']]?.args,
          site: 'server-call-args',
          entry: raw.n,
          payload: raw.a,
        });
      } catch (validationError) {
        if (closeController.isClosed()) {
          return;
        }
        port.postMessage({ v: 1, k: 'rs', i: id, o: 0, e: toWireError(validationError) });
        return;
      }
      const ac = new AbortController();
      inFlightCalls.set(id, ac);
      const callImpl = impl.call as WidenedCallImpl;
      // async-iife: bootstrap — wire handlers are sync per Port contract; per-frame
      // dispatch is tracked via inFlightCalls AbortController registry below.
      void (async () => {
        try {
          const out = await callImpl(context, raw.n, validatedArgs, ac.signal);
          if (closeController.isClosed()) {
            return;
          }
          const { value, transfer } = unwrapTransferables(out);
          port.postMessage({ v: 1, k: 'rs', i: id, o: 1, d: value }, transfer);
        } catch (error) {
          if (closeController.isClosed()) {
            return;
          }
          port.postMessage({ v: 1, k: 'rs', i: id, o: 0, e: toWireError(error) });
        } finally {
          inFlightCalls.delete(id);
        }
      })();
      return;
    }
    if (raw.k === 'rc') {
      const ac = inFlightCalls.get(raw.i);
      if (ac) {
        inFlightCalls.delete(raw.i);
        ac.abort();
      }
      return;
    }
    if (raw.k === 'nt') {
      if (protocolSchemas && !Object.hasOwn(protocolSchemas.notifies, raw.n)) {
        reportUnknownNotify(raw.n);
        return;
      }
      let validatedArgs: unknown;
      try {
        validatedArgs = validateWireFrame({
          validator: protocolSchemas?.notifies[raw.n as keyof P['notifies']],
          site: 'server-notify-args',
          entry: raw.n,
          payload: raw.a,
        });
      } catch {
        /* Drop notifies that fail wire validation on the server side —
         * fire-and-forget messages have no caller to reject. */
        return;
      }
      if (impl.notify) {
        try {
          (impl.notify as WidenedNotifyImpl)(context, raw.n, validatedArgs);
        } catch {
          // Drop notify handler errors so the channel survives.
        }
      }
      return;
    }
    if (raw.k === 'ss') {
      const subId = raw.i;
      let validatedArgs: unknown;
      try {
        validatedArgs = validateWireFrame({
          validator: protocolSchemas?.listens[raw.n as keyof P['listens']]?.args,
          site: 'server-listen-args',
          entry: raw.n,
          payload: raw.a,
        });
      } catch (validationError) {
        if (!closeController.isClosed()) {
          port.postMessage({ v: 1, k: 'se', i: subId, e: toWireError(validationError) });
        }
        return;
      }
      const ac = new AbortController();
      inFlightStreams.set(subId, ac);
      const listenImpl = impl.listen as WidenedListenImpl;
      // async-iife: bootstrap — wire handlers are sync per Port contract; per-stream
      // dispatch is tracked via inFlightStreams AbortController registry below.
      void (async () => {
        let iterable: AsyncIterable<unknown>;
        try {
          const listenResult = listenImpl(context, raw.n, validatedArgs, ac.signal);
          iterable = await resolveListenIterable(listenResult);
        } catch (error) {
          inFlightStreams.delete(subId);
          if (closeController.isClosed()) {
            return;
          }
          port.postMessage({ v: 1, k: 'se', i: subId, e: toWireError(error) });
          return;
        }
        try {
          for await (const item of iterable) {
            if (ac.signal.aborted || closeController.isClosed()) {
              break;
            }
            const { value, transfer } = unwrapTransferables(item);
            port.postMessage({ v: 1, k: 'sn', i: subId, d: value }, transfer);
          }
          if (!closeController.isClosed()) {
            port.postMessage({ v: 1, k: 'sc', i: subId });
          }
        } catch (error) {
          if (!closeController.isClosed()) {
            port.postMessage({ v: 1, k: 'se', i: subId, e: toWireError(error) });
          }
        } finally {
          inFlightStreams.delete(subId);
        }
      })();
      return;
    }
    if (raw.k === 'su') {
      const ac = inFlightStreams.get(raw.i);
      if (ac) {
        inFlightStreams.delete(raw.i);
        ac.abort();
      }
      return;
    }
    if (raw.k === 'lb') {
      closeController.acceptRemote(raw.r);
      return;
    }
    if (raw.k === 'fa') {
      warnFlowAckOnce();
      return;
    }
    if (raw.k === 'fw') {
      warnFlowWindowOnce();
    }
    // Unhandled known kinds (rs/sn/sc/se/lh) for server side: drop.
  };

  let off: () => void = (): void => undefined;

  const cleanupInFlight = (): void => {
    for (const ac of inFlightCalls.values()) {
      ac.abort();
    }
    inFlightCalls.clear();
    for (const ac of inFlightStreams.values()) {
      ac.abort();
    }
    inFlightStreams.clear();
  };

  const closeController = createCloseController({
    postClose: (reason) => {
      const frame: WireBye = reason === undefined ? { v: 1, k: 'lb' } : { v: 1, k: 'lb', r: reason };
      port.postMessage(frame);
    },
    onTeardown: () => {
      cleanupInFlight();
    },
    onFinalize: () => {
      off();
    },
    closeHandshakeTimeout: closeTimeout,
  });

  off = port.onMessage(onWire);
  if (port.start) {
    port.start();
  }

  // Send hello immediately. Receivers may queue calls while their own port hasn't started yet,
  // but the standard MessagePort start() before client construction makes this race-safe in tests.
  try {
    const helloFrame: WireMessage = hello === undefined ? { v: 1, k: 'lh', o: 1 } : { v: 1, k: 'lh', o: 1, d: hello };
    port.postMessage(helloFrame);
  } catch {
    // Port not ready: dispose immediately.
    closeController.initiateLocal('hello-failed');
  }

  return {
    dispose(reason?: string): void {
      closeController.initiateLocal(reason);
    },
    get closed() {
      return closeController.closed;
    },
    onClose(handler) {
      return closeController.onClose(handler);
    },
    notify(name, args) {
      if (closeController.isClosed()) {
        return;
      }
      const { value, transfer } = unwrapTransferables(args);
      const frame: WireNotify = { v: 1, k: 'nt', n: name, a: value ?? null };
      port.postMessage(frame, transfer);
    },
  };
};
