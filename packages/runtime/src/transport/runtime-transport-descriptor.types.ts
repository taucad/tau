/**
 * Diagnostic snapshot of the transport's chosen strategy. Surfaced only in
 * logs, development panels, and conformance tests. Runtime behavior must not
 * branch on this descriptor.
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
