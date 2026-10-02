/**
 * Transport-internal bridge between the opaque {@link RuntimeFileSystem}
 * surface and the underlying discriminated handle every transport needs
 * to bind (`inline` → in-isolate, `channel` → bridge `MessagePort` over
 * the wire).
 *
 * The opaque {@link RuntimeFileSystem} value carries a non-exported
 * `Symbol` key whose value is the underlying handle. Consumer-facing
 * `fromX` factories produce values via {@link wrapAsRuntimeFileSystem};
 * transports extract them via {@link resolveRuntimeFileSystem}. The
 * runtime core (client/host/framework) never reads the symbol — only
 * transport implementations under `@taucad/runtime/transport` do.
 *
 * Lives under `transport/_internal/` so the public
 * `@taucad/runtime/filesystem` barrel exposes only opaque types and
 * factories — no resolver, no symbol, no discriminated handle.
 *
 * @internal
 */

import { safeDispose } from '@taucad/utils/dispose';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import { filesystemBridgeConnectMessageType } from '#framework/runtime-framework.constants.js';

/**
 * Internal discriminated filesystem handle. The transport plane reads this
 * to decide whether the FS lives in the same isolate (`inline` — invoke
 * `create()` to mint a fresh `RuntimeFileSystemBase` per binding) or
 * behind a `MessagePort` bridge (`channel` — wire it through
 * `createBridgeServer` in the host).
 *
 * The inline arm is a **per-binding factory**, not a captured live
 * instance. Mirroring the v6 transport callable-plugin contract: the
 * opaque `RuntimeFileSystem` value held in module-level options is a
 * plain-data spec; each `RuntimeClient` materialisation invokes
 * `handle.create()` once to produce its own isolated
 * `RuntimeFileSystemBase`. This eliminates the cross-`RuntimeClient`
 * mutable-state aliasing class of bugs by construction (see
 * `docs/research/runtime-filesystem-spec-instance-harmonisation.md`).
 *
 * Transports never construct these directly — they call
 * {@link resolveRuntimeFileSystem} on a consumer-provided opaque
 * {@link RuntimeFileSystem} value.
 *
 * @internal
 */
export type RuntimeFileSystemHandle =
  | { readonly kind: 'inline'; readonly create: () => RuntimeFileSystemBase }
  | {
      readonly kind: 'channel';
      readonly port: MessagePort;
      readonly dispose?: () => void;
    };

/**
 * Internal factory: bridge a `Worker` that already serves the FS bridge
 * protocol. Eagerly opens a `MessageChannel`, posts `port1` to the
 * worker, and stores `port2` on the returned handle. The accompanying
 * `dispose` closes the host-side port and signals the worker to tear down
 * its bridge server.
 *
 * @internal
 */
export const channelHandleFromWorker = (worker: Worker): RuntimeFileSystemHandle => {
  const channel = new MessageChannel();
  worker.postMessage({ type: filesystemBridgeConnectMessageType, port: channel.port1 }, [channel.port1]);
  const rawPort = channel.port2;
  return {
    kind: 'channel',
    port: rawPort,
    dispose() {
      safeDispose(() => {
        rawPort.postMessage({ type: 'disconnect' });
      });
      safeDispose(() => {
        rawPort.close();
      });
    },
  };
};

/* Module-private symbol — not exported, so external callers cannot
 * forge or extract a `RuntimeFileSystem` payload outside the runtime
 * package. */
const handleSymbol = Symbol('@taucad/runtime/filesystem/handle');

type InternalRuntimeFileSystem = RuntimeFileSystem & {
  readonly [handleSymbol]: RuntimeFileSystemHandle;
};

/**
 * Wrap an internal {@link RuntimeFileSystemHandle} as the opaque
 * {@link RuntimeFileSystem} value the consumer sees. Used by every
 * `fromX` factory.
 *
 * @internal
 */
export const wrapAsRuntimeFileSystem = (handle: RuntimeFileSystemHandle): RuntimeFileSystem => {
  return { [handleSymbol]: handle } as unknown as RuntimeFileSystem;
};

/**
 * Extract the underlying {@link RuntimeFileSystemHandle} from an opaque
 * {@link RuntimeFileSystem}. Used by transports to bind the appropriate
 * arm (`inline` → in-isolate, `channel` → bridge MessagePort over wire).
 *
 * @internal
 */
export const resolveRuntimeFileSystem = (fs: RuntimeFileSystem): RuntimeFileSystemHandle => {
  if (!(handleSymbol in fs)) {
    throw new TypeError('RuntimeFileSystem: missing internal handle — value was not produced by a fromX factory');
  }
  return (fs as InternalRuntimeFileSystem)[handleSymbol];
};

/**
 * Predicate the public `isRuntimeFileSystem` guard delegates to.
 * Returns `true` when `value` carries the package-private handle
 * symbol — i.e. it was produced by a `fromX` factory.
 *
 * @internal
 */
export const hasRuntimeFileSystemHandle = (value: unknown): value is RuntimeFileSystem => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return handleSymbol in value;
};

/**
 * Extract the inline `RuntimeFileSystemBase` backing an opaque
 * {@link RuntimeFileSystem} when it was produced by an in-isolate factory
 * (`fromMemoryFs`, `fromNodeFs`, `fromFsLike`, etc.). Returns `undefined`
 * when no handle was supplied.
 *
 * Throws {@link TypeError} when the opaque value is a channel-bridged
 * filesystem (`fromChannelFs`) — those must be wired via
 * `memoryHandle.fileSystemPort`, not passed to
 * {@link createWorkerDispatcher}'s `inlineFileSystem`.
 *
 * Ordinary consumers use opaque {@link RuntimeFileSystem} only; transport
 * authors reach for this via `@taucad/runtime/transport-internals`.
 *
 * @public
 */
export const extractInlineFileSystem = (fs: RuntimeFileSystem | undefined): RuntimeFileSystemBase | undefined => {
  if (!fs) {
    return undefined;
  }
  const handle = resolveRuntimeFileSystem(fs);
  if (handle.kind !== 'inline') {
    throw new TypeError(`extractInlineFileSystem: expected inline fs, received '${handle.kind}'`);
  }
  return handle.create();
};
