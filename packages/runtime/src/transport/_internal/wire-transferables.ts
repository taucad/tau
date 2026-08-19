/**
 * Generic transferable scanner for the v6 channel wire layer.
 *
 * The channel client extracts `WithTransferables.transferables` and hands
 * them to `port.postMessage(envelope, transferables)` so they cross the
 * structured-clone boundary by reference. When a transport bridges a port
 * across a worker / Electron / process seam, the inbound `MessageEvent.data`
 * already has any transferred handles materialised inside the envelope
 * payload, so the transport has to walk the structure to recover them
 * before posting onward. This walker is the single source of truth for that
 * recovery — transports never decode protocol shapes themselves.
 *
 * The walker recognises the two transferable categories the runtime
 * carries today:
 *
 * - `MessagePort` — embedded in `initialize` / FS bridge handoffs.
 * - `ArrayBuffer` — embedded in geometry / export delivery.
 *
 * `SharedArrayBuffer` is intentionally excluded: SABs are shared, not
 * transferred, so they ride the wire as ordinary clone references with
 * no transferables-list ceremony.
 *
 * Lives under `transport/_internal/` because it is wire-layer plumbing
 * consumed exclusively by transport implementations.
 *
 * @internal
 */

import type { MessagePortLike } from '@taucad/rpc';

/**
 * Detect a port by shape rather than by `instanceof`. `globalThis.MessagePort`
 * has existed in Node since v15 and `worker_threads.MessagePort` *is* it, so
 * the `instanceof` arm is not the problem it was once documented to be — the
 * sniff exists because the runtime also admits plain structural ports
 * supplied by in-process hosts, which are not `MessagePort` instances.
 *
 * The accepted shape is exactly `MessagePortLike` — `postMessage`,
 * `addEventListener`, `removeEventListener`, `close` — because every consumer
 * of the value drives it through `wrapMessagePort`, which calls those four.
 * EventEmitter-shaped ports (`on`/`off`) are deliberately **not** admitted:
 * the validator must not accept a shape its consumer cannot drive
 * (`wrapMessagePortMain` in `electron/electron-utility-host.ts` is the
 * adapter for that family, and it never crosses the initialize path).
 *
 * Shared with `runtime-protocol.schemas.ts`, which validates
 * `InitializeMemoryHandle.fileSystemPort` with it.
 *
 * @internal
 */
export function isMessagePortLike(value: unknown): value is MessagePortLike {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<keyof MessagePortLike, unknown>;
  return (
    typeof candidate.postMessage === 'function' &&
    typeof candidate.addEventListener === 'function' &&
    typeof candidate.removeEventListener === 'function' &&
    typeof candidate.close === 'function'
  );
}

/**
 * Walk an opaque envelope payload looking for transferable handles.
 *
 * The walker is bounded: it recurses into arrays and plain objects, but
 * stops at primitive values, typed-array views, `Date`, `Map`, `Set`,
 * and `SharedArrayBuffer`. Cycles are detected via a visited-set so
 * cyclic payloads (rare on the wire) cannot diverge.
 *
 * @param value - the inbound envelope (typically `WireMessage` or its
 *   payload subtree); accepted as `unknown` because runners do not
 *   decode protocol shapes.
 * @returns the recovered transferables, in iteration order.
 *
 * @public
 */
export function collectWireTransferables(value: unknown): Transferable[] {
  const transferables: Transferable[] = [];
  const visited = new WeakSet<Record<string, unknown>>();

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') {
      return;
    }
    const object = node as Record<string, unknown>;
    if (visited.has(object)) {
      return;
    }
    visited.add(object);

    if (isMessagePortLike(object)) {
      transferables.push(object as unknown as Transferable);
      return;
    }
    if (object instanceof ArrayBuffer) {
      transferables.push(object);
      return;
    }
    if (
      ArrayBuffer.isView(object) ||
      object instanceof SharedArrayBuffer ||
      object instanceof Date ||
      object instanceof Map ||
      object instanceof Set
    ) {
      return;
    }
    if (Array.isArray(object)) {
      for (const item of object) {
        walk(item);
      }
      return;
    }
    for (const item of Object.values(object)) {
      walk(item);
    }
  };

  walk(value);
  return transferables;
}
