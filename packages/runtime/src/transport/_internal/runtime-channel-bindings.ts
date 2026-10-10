import type { MessagePortLike, Port } from '@taucad/rpc';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import type {
  EncodedBinary,
  HostInitializeBindings,
  RuntimeInitializeMemoryHandle,
} from '#transport/runtime-transport.types.js';

/** The runtime worker channel identity shared by its four transports. @internal */
export const runtimeChannelSessionKey = 'tau.runtime/v1';

/** Encode one owned binary payload for pooled, transfer or copied delivery. @internal */
export type BinaryEncoder = (key: string, bytes: Uint8Array<ArrayBuffer>) => EncodedBinary;

/** Host bindings required by the document protocol dispatcher. @internal */
export type DocumentWorkerDispatcherOptions = {
  readonly inlineFileSystem?: RuntimeFileSystemBase;
  /** A filesystem bridge port handed over outside `initialize` (a websocket connection's thread). */
  readonly fileSystemPort?: MessagePortLike;
  /** Host-compiled WASM modules handed over outside `initialize`. */
  readonly compiledWasmModules?: RuntimeInitializeMemoryHandle['compiledWasmModules'];
  readonly computeStorePort?: MessagePortLike | Port<unknown>;
  readonly computeBindingMode?: 'off' | 'memory';
  readonly encodeBinary?: BinaryEncoder;
  readonly acknowledgeBinary?: (key: string) => void;
  readonly bindingsFactory?: (handle: RuntimeInitializeMemoryHandle) => HostInitializeBindings;
};

/**
 * `workerData` key under which a host hands a worker thread one connection's
 * ports. A string, because a symbol does not survive structured clone.
 *
 * @internal
 */
export const runtimeConnectionWorkerDataKey = 'tau.runtime/connection';

/** What a host hands a worker thread under {@link runtimeConnectionWorkerDataKey}. @internal */
export type RuntimeConnectionWorkerData = Pick<
  DocumentWorkerDispatcherOptions,
  'compiledWasmModules' | 'fileSystemPort'
> & { readonly computeStorePort?: MessagePortLike };
