import { createRequire } from 'node:module';

/** One kernel request from a private projection mount. Inode identity and policy belong to its host. @internal */
export type ShellProjectionRequest = Readonly<{
  id: number;
  operation:
    | 'lookup' | 'getattr' | 'open' | 'read' | 'write' | 'create' | 'mkdir' | 'setattr'
    | 'rename' | 'unlink' | 'rmdir' | 'readdir' | 'release' | 'flush' | 'fsync' | 'forget';
  inode: bigint;
  handle: bigint;
  destinationParent: bigint;
  lookupCount: bigint;
  offset: number;
  length: number;
  flags: number;
  mode: number;
  attributes: number;
  name?: string;
  destinationName?: string;
  data?: Uint8Array<ArrayBuffer>;
}>;

/** The host's classified inode description. No native backing paths cross this seam. @internal */
export type ShellProjectionEntry = Readonly<{ inode: bigint; mode: number; size: number; links: number }>;

/** Replies are validated by the native bridge before they reach the kernel. @internal */
export type ShellProjectionReply = Readonly<{
  error?: number;
  entry?: ShellProjectionEntry;
  handle?: bigint;
  bytes?: Uint8Array<ArrayBuffer>;
  written?: number;
  entries?: readonly Readonly<{ name: string; inode: bigint; mode: number }>[];
}>;

type NativeBinding = Readonly<{
  mount: (path: string, callback: (request: ShellProjectionRequest) => void) => object;
  reply: (mount: object, id: number, result: ShellProjectionReply) => boolean;
  close: (mount: object) => void;
}>;

/** A mount whose disposal aborts callbacks and waits for its host's accepted work. @internal */
export type ShellProjectionMount = AsyncDisposable;

/**
 * Open the private Linux transport over a host-owned empty mountpoint.
 *
 * This bridge supplies no inode store, classifier, mutation authority or durable custody. Its host must retain
 * those resources until disposal settles. Native writeback caching is disabled; requests and copied byte buffers
 * are bounded. Incoming versions require new inode identities, not overwriting an existing mapped inode.
 *
 * @internal
 * @param options - Exact reviewed binary, private mountpoint and authority-owned request handler.
 * @returns A mount lifetime; failure never falls back to ordinary disk access.
 */
export const openShellProjectionMount = (options: Readonly<{
  binary: string;
  mountpoint: string;
  handle: (request: ShellProjectionRequest, signal: AbortSignal) => Promise<ShellProjectionReply>;
}>): ShellProjectionMount => {
  if (process.platform !== 'linux') throw new Error('The shell projection bridge requires Linux.');
  // The pinned host-built N-API module is the native ABI boundary, not an untrusted plugin selection.
  const binding = createRequire(import.meta.url)(options.binary) as NativeBinding;
  const controller = new AbortController();
  const pending = new Set<Promise<void>>();
  const failures: unknown[] = [];
  let disposal: Promise<void> | undefined;
  let mount: object;
  const settle = async (request: ShellProjectionRequest): Promise<void> => {
    let reply: ShellProjectionReply;
    try {
      reply = await options.handle(request, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) failures.push(error);
      reply = { error: 5 }; // EIO: callback failure never becomes successful native I/O.
    }
    if (!controller.signal.aborted) binding.reply(mount, request.id, reply);
  };
  mount = binding.mount(options.mountpoint, (request) => {
    const operation = settle(request);
    pending.add(operation);
    const remove = async (): Promise<void> => {
      try { await operation; } catch (error) { failures.push(error); } finally { pending.delete(operation); }
    };
    // async-iife: bootstrap -- every accepted operation remains owned by pending until disposal observes it.
    void remove();
  });
  return {
    [Symbol.asyncDispose]: () => {
      disposal ??= (async () => {
        controller.abort(new Error('Shell projection mount closed.'));
        binding.close(mount);
        await Promise.allSettled(pending);
        if (failures.length > 0) throw new AggregateError(failures, 'Shell projection callbacks failed.');
      })();
      return disposal;
    },
  };
};
