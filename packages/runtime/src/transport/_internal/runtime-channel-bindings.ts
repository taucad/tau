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
  readonly computeStorePort?: MessagePortLike | Port<unknown>;
  readonly computeBindingMode?: 'off' | 'memory';
  readonly encodeBinary?: BinaryEncoder;
  readonly acknowledgeBinary?: (key: string) => void;
  readonly bindingsFactory?: (handle: RuntimeInitializeMemoryHandle) => HostInitializeBindings;
};
