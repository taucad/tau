/**
 * Canonical runtime transport primitives.
 *
 * Three single-purpose primitives:
 *
 * - {@link TransportPlugin} — consumer-facing registration returned by calling
 *   bundled transports (`webWorkerTransport(opts)`, `inProcessTransport(opts)`).
 * - {@link RuntimeTransportClient} — fat consumer-facing handle. Owns SAB,
 *   abort, geometry pool, FS bridge. Exposes `open` / `initialize` /
 *   `abort` / `resolveGeometry` / `close` / `closed`.
 * - {@link RuntimeTransportHost} — fat kernel-host-facing handle. Owns wire
 *   encoding tiers. Exposes `open` / `adoptInitialize` / `encodeGeometry`
 *   / `encodeFile` / `close` / `closed`.
 *
 * The runtime core (`createRuntimeClient` + `RuntimeWorkerClient` +
 * `createRuntimeHost` + dispatcher) calls these methods only. It never
 * sees `MessagePort`, `SharedArrayBuffer`, transferables, or
 * `port.capabilities`.
 *
 * @public
 */

import type { Channel, ChannelServerHandle, RpcProtocol } from '@taucad/rpc';
import type { Geometry } from '@taucad/types';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';
import type {
  AbortReason,
  GeometryGltfTransport,
  GeometryTransport,
  InitializeMemoryHandle,
  RuntimeInitializeArgs,
  RuntimeInitializeResult,
  RuntimeProtocol,
} from '#types/runtime-protocol.types.js';

/* ============================================================ *
 * Phantom carriers — `unique symbol` brands that flow type      *
 * information through the transport plugin pipeline without any *
 * runtime cost.                                                 *
 * ============================================================ */

/** Phantom: literal id of the transport (e.g. `'web-worker'`). */
declare const __transportId: unique symbol;
/** Phantom: protocol carried by the transport (default `RuntimeProtocol`). */
declare const __transportProtocol: unique symbol;
/** Phantom: bindings extra carried by the transport host bindings. */
declare const __transportBindingsExtra: unique symbol;
/** Phantom: worker/host-owned runtime definition carried by same-isolate transports. */
declare const __transportRuntime: unique symbol;

/* ============================================================ *
 * Transport descriptor                                          *
 * ============================================================ */

/**
 * Diagnostic snapshot of the transport's chosen strategy. Surfaced
 * only in logs / dev panels / conformance tests. Never branched on by
 * runtime code. Generic over the literal transport id so descriptors
 * can be discriminated by id.
 *
 * @template Id - The transport's literal id.
 * @public
 */
export type TransportDescriptor<Id extends string = string> = {
  readonly id: Id;
  readonly wire: 'in-process' | 'web-worker' | 'node-worker' | 'electron-utility' | 'cross-process' | 'remote';
  readonly memory: {
    readonly geometryDelivery: 'pool' | 'transfer' | 'copy';
    readonly fileDelivery: 'pool' | 'transfer' | 'copy';
    readonly abortSignal: 'sab-atomics' | 'wire-notify';
  };
  readonly fileSystem: 'inline' | 'bridged' | 'host-local' | 'unbound';
};

/**
 * Hello payload exchanged on `open()`. Carries the runtime version
 * string and the transport id; transports may extend by intersecting
 * additional fields, but the canonical core stays fixed.
 *
 * @public
 */
export type TransportHelloPayload = {
  readonly server: 'kernel-runtime-worker';
  readonly runtimeVersion: string;
  readonly transportId: string;
};

/* ============================================================ *
 * Initialize payload + memory handle aliases                    *
 * ============================================================ */

/**
 * Payload accepted by {@link RuntimeTransportClient.initialize}. The
 * runtime client passes its protocol-level `initialize` args; the
 * transport assembles the {@link RuntimeInitializeMemoryHandle}
 * envelope from its own internal state (allocated SAB pools, FS
 * bridge port, etc.) and chooses transferable vs copy semantics based
 * on what its wire supports. The runtime never sees the wire-level
 * transferables list.
 *
 * @public
 */
export type RuntimeInitializePayload = Omit<RuntimeInitializeArgs, 'memoryHandle'>;

/**
 * Re-export alias of the protocol-level memory handle shape used by
 * {@link RuntimeTransportHost.adoptInitialize}.
 *
 * @public
 */
export type RuntimeInitializeMemoryHandle = InitializeMemoryHandle;

/* ============================================================ *
 * Encoded delivery descriptors                                  *
 * ============================================================ */

/**
 * Result of {@link RuntimeTransportHost.encodeGeometry}. The host
 * transport picks the fastest delivery tier its wire allows
 * (`pool` > `transfer` > `copy`); the dispatcher publishes the
 * returned descriptor over the channel; the transport supplies the
 * matching transferables list at the wire layer.
 *
 * @public
 */
export type EncodedGeometry = {
  readonly value: GeometryGltfTransport | unknown;
  readonly transferables: readonly Transferable[];
  readonly tier: 'pool' | 'transfer' | 'copy';
};

/**
 * Result of {@link RuntimeTransportHost.encodeFile}. Mirrors
 * {@link EncodedGeometry} for the file-delivery binding.
 *
 * @public
 */
export type EncodedFileBytes = {
  readonly value: unknown;
  readonly transferables: readonly Transferable[];
  readonly tier: 'pool' | 'transfer' | 'copy';
};

/* ============================================================ *
 * Host-initialize bindings                                      *
 * ============================================================ */

/**
 * Cooperative-abort binding produced by the host transport. Each
 * transport implements its preferred strategy under one uniform
 * interface so the dispatcher does not branch on strategy.
 *
 * @public
 */
export type HostAbortBinding = {
  /** AbortSignal observed by every kernel call (driven by SAB Atomics or wire notify). */
  readonly signal: AbortSignal;
  readonly strategy: 'sab-atomics' | 'wire-notify';
};

/**
 * Geometry-delivery binding produced by the host transport. The
 * dispatcher hands a `Geometry` to `publish()` and receives the
 * matching {@link EncodedGeometry} the wire layer should send.
 *
 * @public
 */
export type HostGeometryDeliveryBinding = {
  readonly tier: 'pool' | 'transfer' | 'copy';
  publish(geometry: Geometry): EncodedGeometry;
};

/**
 * File-delivery binding produced by the host transport. Symmetric
 * with {@link HostGeometryDeliveryBinding}.
 *
 * @public
 */
export type HostFileDeliveryBinding = {
  readonly tier: 'pool' | 'transfer' | 'copy';
  publish(file: Uint8Array<ArrayBuffer>): EncodedFileBytes;
};

/**
 * Canonical core bindings every transport host produces during
 * `adoptInitialize`. Each field is an interface implementation that
 * the dispatcher uses uniformly; the transport supplies the concrete
 * strategy (SAB-backed, wire-notify-backed, etc.). Kernel filesystem
 * binding is **not** part of this shape — it flows through
 * `createWorkerDispatcher`'s `inlineFileSystem` option and/or
 * `memoryHandle.fileSystemPort`. Per-transport extras extend this shape
 * via the `BindingsExtra` generic on {@link HostInitializeBindings}.
 *
 * @public
 */
export type HostInitializeBindingsCore = {
  readonly abort: HostAbortBinding;
  readonly geometryDelivery: HostGeometryDeliveryBinding;
  readonly fileDelivery: HostFileDeliveryBinding;
};

/**
 * Full bindings shape for a transport — the canonical core
 * intersected with the transport-specific `BindingsExtra`. Generic
 * over `BindingsExtra` so each transport contributes its own
 * bindings without coupling the dispatcher to one fixed shape.
 *
 * @public
 */
export type HostInitializeBindings<
  BindingsExtra extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>,
> = HostInitializeBindingsCore & BindingsExtra;

/* ============================================================ *
 * Ready snapshots returned by `open()`                           *
 * ============================================================ */

/**
 * Snapshot returned by `client.open()`. Carries the typed channel
 * for the runtime client to wire its protocol handlers onto.
 *
 * @public
 */
export type TransportClientReady<Protocol extends RpcProtocol = RuntimeProtocol> = {
  readonly channel: Channel<Protocol>;
  readonly hello: TransportHelloPayload;
};

/**
 * Snapshot returned by `host.open()`. Mirrors
 * {@link TransportClientReady} on the host side.
 *
 * @public
 */
export type TransportHostReady<Protocol extends RpcProtocol = RuntimeProtocol> = {
  readonly channel: ChannelServerHandle<Protocol>;
  readonly peerHello: TransportHelloPayload;
};

/* ============================================================ *
 * Fat client / host handles                                     *
 * ============================================================ */

/**
 * Runtime-facing transport handle returned by client factories (e.g.
 * {@link webWorkerClient}).
 * The {@link RuntimeClient} consumes this handle and never inspects
 * the implementation. Generic over the wire protocol and the
 * per-transport bindings extras the host side will produce.
 *
 * @template Protocol      - RPC protocol carried over the wire.
 * @template BindingsExtra - Transport-specific host-binding extensions.
 * @template Id            - Literal transport id.
 * @public
 */
export type RuntimeTransportClient<
  Protocol extends RpcProtocol = RuntimeProtocol,
  BindingsExtra extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>,
  Id extends string = string,
> = {
  /** Literal id (matches the plugin's `id`). */
  readonly id: Id;

  /** Resolves once the transport is closed (for any reason). */
  readonly closed: Promise<void>;

  /**
   * Phantom carrier so RuntimeClient can project BindingsExtra.
   * Marked `@internal` so doc generators filter it before serialization
   * (the symbol's TS-internal display name contains literal `@`
   * characters that break MDX/JSX parsers).
   *
   * @internal
   */
  readonly [__transportBindingsExtra]?: BindingsExtra;

  /** Human/diagnostic descriptor; never used to branch runtime behaviour. */
  describe(): TransportDescriptor<Id>;

  /**
   * Open the wire, spawn the host (if applicable), exchange hello.
   * Idempotent: calling `open()` twice resolves the same channel.
   */
  open(): Promise<TransportClientReady<Protocol>>;

  /**
   * Send the runtime `initialize` call. The transport assembles the
   * {@link RuntimeInitializeMemoryHandle} envelope from its own
   * internal state (allocated SAB pools, FS bridge port, etc.) and
   * chooses transferable vs copy semantics based on what its wire
   * supports. The runtime never sees the wire-level transferables
   * list.
   */
  initialize(input: RuntimeInitializePayload): Promise<RuntimeInitializeResult>;

  /**
   * Cooperative abort. The transport picks the fastest signalling
   * path its wire supports — typically SAB Atomics for in-process /
   * web-worker / node-worker / utilityProcess wires, falling back to
   * wire notify for cross-process wires that cannot share memory.
   * Always also sends a wire notify so the host has receipt
   * regardless of medium.
   */
  abort(reason: AbortReason): void;

  /**
   * Materialise an {@link GeometryTransport} payload received
   * off the wire back into a usable `Geometry`. The transport owns
   * the pool wiring; the consumer never sees `SharedArrayBuffer`.
   */
  resolveGeometry(transport: GeometryTransport): Promise<Geometry>;

  /**
   * Close the wire, terminate the host. After `close()` resolves the
   * transport is unusable; callers must construct a new instance.
   */
  close(reason?: string): Promise<void>;
};

/**
 * Host-facing transport handle returned by host factories (e.g.
 * {@link webWorkerHost}). Used inside kernel-host scripts (web-worker entry, node-worker entry,
 * Electron utility-process entry).
 *
 * @template Protocol      - RPC protocol served by the host.
 * @template BindingsExtra - Transport-specific host-binding extensions.
 * @template Id            - Literal transport id.
 * @public
 */
export type RuntimeTransportHost<
  Protocol extends RpcProtocol = RuntimeProtocol,
  BindingsExtra extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>,
  Id extends string = string,
> = {
  readonly id: Id;
  readonly closed: Promise<void>;

  /**
   * Open the host-side wire, advertise hello. After `open()` resolves
   * the channel is wired and the host can register protocol handlers.
   */
  open(): Promise<TransportHostReady<Protocol>>;

  /**
   * Adopt the {@link RuntimeInitializeMemoryHandle} delivered in the
   * `initialize` request. The host transport reconstructs internal
   * SAB pools, mounts the bridged FS port if present, arms the abort
   * signal slot, and contributes any per-transport extras into the
   * returned {@link HostInitializeBindings}.
   */
  adoptInitialize(handle: RuntimeInitializeMemoryHandle): HostInitializeBindings<BindingsExtra>;

  /**
   * Encode a kernel geometry for transmission. The host transport
   * picks the fastest delivery tier its wire allows.
   */
  encodeGeometry(geometry: Geometry): EncodedGeometry;

  /**
   * Encode a file payload for transmission. Mirrors
   * {@link encodeGeometry} for the file delivery binding.
   */
  encodeFile(file: Uint8Array<ArrayBuffer>): EncodedFileBytes;

  close(reason?: string): Promise<void>;
};

/* ============================================================ *
 * Transport plugin (consumer surface)                             *
 * ============================================================ */

/**
 * Wired transport plugin returned by bundled transport factories
 * (`webWorkerTransport(opts)`, …). Matches the shape of
 * {@link KernelPlugin} / {@link TranscoderPlugin}: a plain callable
 * per transport returns this object with a lazy {@link TransportPlugin.materialize}
 * that constructs the fat {@link RuntimeTransportClient}.
 *
 * Host-side constructors (`webWorkerHost`, `electronUtilityHost`, …)
 * are standalone named exports, not accessors on this object.
 *
 * @template Protocol      - RPC protocol carried over the wire.
 * @template BindingsExtra - Transport-specific host-binding extensions.
 * @template Id            - Literal transport id.
 * @template Runtime       - Runtime definition owned by this transport topology, when applicable.
 * @public
 */
export type TransportPlugin<
  Protocol extends RpcProtocol = RuntimeProtocol,
  BindingsExtra extends Readonly<Record<string, unknown>> = Readonly<Record<never, never>>,
  Id extends string = string,
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
> = {
  readonly id: Id;

  /** @internal */
  readonly [__transportId]?: Id;
  /** @internal */
  readonly [__transportProtocol]?: Protocol;
  /** @internal */
  readonly [__transportBindingsExtra]?: BindingsExtra;
  /** @internal */
  readonly [__transportRuntime]?: Runtime;

  /** Pure diagnostic snapshot — never allocates SAB, spawns workers, or opens wires. */
  describe(): TransportDescriptor<Id>;

  /** @internal */
  materialize(): RuntimeTransportClient<Protocol, BindingsExtra, Id>;
};

/* ============================================================ *
 * Phantom carrier accessors                                     *
 * ============================================================ */

/**
 * Internal projection helpers — exported so consumer code can
 * extract phantom-tagged generics from a {@link TransportPlugin}
 * registration without restating its type parameters.
 *
 * @internal
 */
export type TransportIdPhantomSlot = typeof __transportId;
/** @internal */
export type TransportProtocolPhantomSlot = typeof __transportProtocol;
/** @internal */
export type TransportBindingsExtraPhantomSlot = typeof __transportBindingsExtra;
/** @internal */
export type TransportRuntimePhantomSlot = typeof __transportRuntime;
