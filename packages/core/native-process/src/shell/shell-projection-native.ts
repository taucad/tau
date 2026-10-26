import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  mount: (path: string, callback: (request: ShellProjectionRequest) => void, failure: () => void) => object;
  libraryIdentity: () => Readonly<{ path: string; version: string }>;
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
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('The shell projection bridge requires Linux x64.');
  // The pinned host-built N-API module is the native ABI boundary, not an untrusted plugin selection.
  const binary = realpathSync(options.binary);
  const adjacent = realpathSync(join(dirname(binary), 'libfuse3.so.4'));
  const manifest: unknown = JSON.parse(readFileSync(join(dirname(binary), 'provenance.json'), 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || !('library' in manifest) || !('libfuse' in manifest) || !('abi' in manifest) || !('binary' in manifest) ||
    manifest.abi !== 'linux-x64-napi8-fuse35' || createHash('sha256').update(readFileSync(binary)).digest('hex') !== manifest.binary ||
    manifest.libfuse !== '3.17.2' || typeof manifest.library !== 'string' ||
    createHash('sha256').update(readFileSync(adjacent)).digest('hex') !== manifest.library) {
    throw new Error('Projection library does not match its reviewed build manifest.');
  }
  const binding = createRequire(import.meta.url)(binary) as NativeBinding;
  const identity = binding.libraryIdentity();
  if (realpathSync(identity.path) !== adjacent || identity.version !== manifest.libfuse) {
    throw new Error('Projection did not load its reviewed adjacent library.');
  }
  const mountpoint = realpathSync(options.mountpoint);
  const controller = new AbortController();
  const pending = new Set<Promise<void>>();
  const failures: unknown[] = [];
  let disposal: Promise<void> | undefined;
  let mount: object;
  const close = (reason: Error): void => {
    binding.close(mount);
    const mounted = readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some((line) =>
      line.split(' ')[4]?.replace(/\\([0-7]{3})/gu, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8))) === mountpoint);
    if (mounted) throw new Error('Projection unmount is unconfirmed; owner must retain accounting and custody.');
    // Only confirmed unmount permits the owner to reconcile all remaining inode references.
    controller.abort(reason);
  };
  const failed = (): void => {
    const reason = new Error('Projection mount failed; lifetime accounting requires whole-mount reconciliation.');
    failures.push(reason);
    try { close(reason); } catch (error) { failures.push(error); }
  };
  const settle = async (request: ShellProjectionRequest): Promise<void> => {
    let reply: ShellProjectionReply;
    try {
      reply = await options.handle(request, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) failures.push(error);
      reply = { error: 5 }; // EIO: callback failure never becomes successful native I/O.
    }
    if ((request.operation === 'forget' || request.operation === 'release') && reply.error !== undefined && reply.error !== 0) failed();
    if (!controller.signal.aborted) binding.reply(mount, request.id, reply);
  };
  mount = binding.mount(mountpoint, (request) => {
    const operation = settle(request);
    pending.add(operation);
    const remove = async (): Promise<void> => {
      try { await operation; } catch (error) { failures.push(error); } finally { pending.delete(operation); }
    };
    // async-iife: bootstrap -- every accepted operation remains owned by pending until disposal observes it.
    void remove();
  }, failed);
  return {
    [Symbol.asyncDispose]: () => {
      disposal ??= (async () => {
        close(new Error('Shell projection mount closed.'));
        await Promise.allSettled(pending);
        if (failures.length > 0) throw new AggregateError(failures, 'Shell projection callbacks failed.');
      })();
      return disposal;
    },
  };
};
