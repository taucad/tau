import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

/** One kernel request from a private projection mount. Inode identity and policy belong to its host. @internal */
export type ShellProjectionRequest = Readonly<{
  id: number;
  operation:
    | 'lookup'
    | 'getattr'
    | 'open'
    | 'read'
    | 'write'
    | 'create'
    | 'mkdir'
    | 'setattr'
    | 'rename'
    | 'unlink'
    | 'rmdir'
    | 'readdir'
    | 'release'
    | 'fsync'
    | 'forget'
    | 'readlink';
  inode: bigint;
  handle: bigint;
  destinationParent: bigint;
  lookupCount: bigint;
  offset: number;
  length: number;
  flags: number;
  mode: number;
  attributes: number;
  /** Requested modification time for `setattr`: epoch milliseconds, -1 for now, 0 when unchanged. */
  modified?: number;
  name?: string;
  destinationName?: string;
  data?: Uint8Array<ArrayBuffer>;
}>;

/** The host's classified inode description. No native backing paths cross this seam. @internal */
export type ShellProjectionEntry = Readonly<{
  inode: bigint;
  /** Regular file, directory or symbolic link; every other kind is refused natively. */
  mode: number;
  size: number;
  links: number;
  /** Epoch milliseconds reported as modification, change and access time. */
  modified?: number;
}>;

/** Replies are validated by the native bridge before they reach the kernel. @internal */
export type ShellProjectionReply = Readonly<{
  error?: number;
  entry?: ShellProjectionEntry;
  handle?: bigint;
  bytes?: Uint8Array<ArrayBuffer>;
  written?: number;
  /** A directory page. Each row's cookie is the offset the next page resumes from; it defaults to its position. */
  entries?: ReadonlyArray<Readonly<{ name: string; inode: bigint; mode: number; cookie?: number }>>;
  /** A symbolic link's stored target, returned verbatim and never resolved by the bridge. */
  target?: string;
  /**
   * Inodes whose cached pages and shared mappings the kernel drops after this reply is sent (at most 64), so a
   * descriptor or mapping never keeps bytes the owner refused. Sent from a bridge thread, never this one.
   */
  invalidate?: readonly bigint[];
}>;

/** Native-only notice that the kernel interrupted a pending request. */
type ShellProjectionInterrupt = Readonly<{ id: number; operation: 'interrupt' }>;

/**
 * Native-only batch of FORGET and RELEASE notifications. The bridge answers them at once, sums forgets per inode and
 * delivers them outside the request budget, so they never take a request slot.
 */
type ShellProjectionLifetime = Readonly<{
  operation: 'lifetime';
  forgets: ReadonlyArray<Readonly<{ inode: bigint; lookupCount: bigint }>>;
  releases: ReadonlyArray<Readonly<{ inode: bigint; handle: bigint }>>;
}>;

declare const nativeMountBrand: unique symbol;
/** Opaque native mount handle; only the binding that returned it can read it. */
type NativeMount = Readonly<{ [nativeMountBrand]: true }>;

type NativeBinding = Readonly<{
  mount: (
    path: string,
    callback: (request: ShellProjectionInterrupt | ShellProjectionLifetime | ShellProjectionRequest) => void,
    failure: () => void,
  ) => NativeMount;
  libraryIdentity: () => Readonly<{ path: string; version: string }>;
  reply: (mount: NativeMount, id: number, result: ShellProjectionReply) => boolean;
  close: (mount: NativeMount) => void;
}>;

/** A mount whose disposal aborts callbacks and waits for its host's accepted work. @internal */
export type ShellProjectionMount = AsyncDisposable;

/**
 * Open the private Linux transport over a host-owned empty mountpoint.
 *
 * This bridge supplies no inode store, classifier, mutation authority or durable custody. Its host must retain
 * those resources until disposal settles. Native writeback caching is disabled; requests and copied byte buffers
 * are bounded. Incoming versions require new inode identities, not overwriting an existing mapped inode. A kernel
 * interrupt aborts only that request's handler signal. FLUSH is answered natively, hard links and new symbolic links
 * are refused natively, and only a plain rename or RENAME_NOREPLACE reaches the handler; RENAME_EXCHANGE is refused.
 * FORGET and RELEASE are answered natively and reach the handler as `forget` and `release` requests with id 0,
 * coalesced per inode, whose replies are not sent to the kernel; a failed one fails the whole mount.
 *
 * @internal
 * @param options - Exact reviewed binary, private mountpoint and authority-owned request handler.
 * @returns A mount lifetime; failure never falls back to ordinary disk access.
 */
export const openShellProjectionMount = (
  options: Readonly<{
    binary: string;
    mountpoint: string;
    handle: (request: ShellProjectionRequest, signal: AbortSignal) => Promise<ShellProjectionReply>;
  }>,
): ShellProjectionMount => {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('The shell projection bridge requires Linux x64.');
  }
  // The pinned host-built N-API module is the native ABI boundary, not an untrusted plugin selection.
  const binary = realpathSync(options.binary);
  const adjacent = realpathSync(join(dirname(binary), 'libfuse3.so.4'));
  const manifest: unknown = JSON.parse(readFileSync(join(dirname(binary), 'provenance.json'), 'utf8'));
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('library' in manifest) ||
    !('libfuse' in manifest) ||
    !('abi' in manifest) ||
    !('binary' in manifest) ||
    manifest.abi !== 'linux-x64-napi8-fuse35' ||
    createHash('sha256').update(readFileSync(binary)).digest('hex') !== manifest.binary ||
    manifest.libfuse !== '3.17.2' ||
    typeof manifest.library !== 'string' ||
    createHash('sha256').update(readFileSync(adjacent)).digest('hex') !== manifest.library
  ) {
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
  // Per-request cancellation: an interrupted caller gets EINTR at once and its handler's signal aborts.
  const requests = new Map<number, AbortController>();
  const earlyInterrupts = new Set<number>();
  const trace = (...parts: unknown[]): void => {
    if (process.env.TAU_PROJECTION_TRACE !== undefined) {
      process.stderr.write(`[wrap ${String(Date.now() % 1_000_000)}] ${parts.map(String).join(' ')}\n`);
    }
  };
  let lastRequest = 0;
  const failures: unknown[] = [];
  let disposal: Promise<void> | undefined;
  const close = (reason: Error): void => {
    binding.close(mount);
    const mounted = readFileSync('/proc/self/mountinfo', 'utf8')
      .split('\n')
      .some(
        (line) =>
          line
            .split(' ')[4]
            ?.replaceAll(/\\([0-7]{3})/gu, (_match, octal: string) =>
              String.fromCodePoint(Number.parseInt(octal, 8)),
            ) === mountpoint,
      );
    if (mounted) {
      throw new Error('Projection unmount is unconfirmed; owner must retain accounting and custody.');
    }
    // Only confirmed unmount permits the owner to reconcile all remaining inode references.
    controller.abort(reason);
  };
  const failed = (): void => {
    const reason = new Error('Projection mount failed; lifetime accounting requires whole-mount reconciliation.');
    failures.push(reason);
    try {
      close(reason);
    } catch (error) {
      failures.push(error);
    }
  };
  // Registering libfuse's interrupt callback may synchronously deliver an already queued interrupt before its
  // request. Native request ids are increasing; notices for settled or rejected older requests can be discarded.
  // Only the handler may answer: replying EINTR here could hide a committed mutation.
  const interrupt = (id: number): void => {
    const request = requests.get(id);
    trace('interrupt id=', id, 'known=', request !== undefined, 'lastRequest=', lastRequest);
    if (request !== undefined) {
      request.abort(new Error('Projection request interrupted.'));
    } else if (id > lastRequest) {
      // The bridge admits at most 128 requests. Refuse an inconsistent stream instead of growing without bound.
      if (earlyInterrupts.size >= 128 && !earlyInterrupts.has(id)) {
        failed();
        return;
      }
      earlyInterrupts.add(id);
    }
  };
  // Lifetime accounting has no kernel reply: a handler that refuses or fails it leaves the owner's counts unknown.
  const account = async (request: ShellProjectionRequest): Promise<void> => {
    let reply: ShellProjectionReply;
    try {
      reply = await options.handle(request, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        failures.push(error);
        failed();
      }
      return;
    }
    if (reply.error !== undefined && reply.error !== 0 && !controller.signal.aborted) {
      failed();
    }
  };
  const lifetime = (batch: ShellProjectionLifetime): Array<Promise<void>> => {
    const base = { id: 0, destinationParent: 0n, offset: 0, length: 0, flags: 0, mode: 0, attributes: 0 } as const;
    return [
      ...batch.forgets.map(async ({ inode, lookupCount }) =>
        account({ ...base, operation: 'forget', inode, handle: 0n, lookupCount }),
      ),
      ...batch.releases.map(async ({ inode, handle }) =>
        account({ ...base, operation: 'release', inode, handle, lookupCount: 0n }),
      ),
    ];
  };
  const settle = async (request: ShellProjectionRequest): Promise<void> => {
    let reply: ShellProjectionReply;
    const local = new AbortController();
    trace('settle enter id=', request.id, 'op=', request.operation, 'inode=', request.inode);
    requests.set(request.id, local);
    lastRequest = request.id;
    if (earlyInterrupts.has(request.id)) {
      local.abort(new Error('Projection request interrupted.'));
    }
    for (const id of earlyInterrupts) {
      if (id <= lastRequest) {
        earlyInterrupts.delete(id);
      }
    }
    try {
      reply = await options.handle(request, AbortSignal.any([controller.signal, local.signal]));
    } catch (error) {
      // Owner contract: a handler rejects after its interrupt only when it committed nothing, so the caller sees EINTR.
      const cancelled = local.signal.aborted && !controller.signal.aborted;
      if (!controller.signal.aborted && !cancelled) {
        failures.push(error);
      }
      reply = { error: cancelled ? 4 : 5 }; // EIO: callback failure never becomes successful native I/O.
    } finally {
      requests.delete(request.id);
    }
    trace('settle reply id=', request.id, 'op=', request.operation, 'error=', reply.error, 'closed=', controller.signal.aborted);
    if (!controller.signal.aborted) {
      binding.reply(mount, request.id, reply);
    }
  };
  const track = (operation: Promise<void>): void => {
    pending.add(operation);
    const remove = async (): Promise<void> => {
      try {
        await operation;
      } catch (error) {
        failures.push(error);
      } finally {
        pending.delete(operation);
      }
    };
    // async-iife: bootstrap -- every accepted operation remains owned by pending until disposal observes it.
    void remove();
  };
  // The callbacks above read `mount` only after native delivery, which cannot precede this assignment.
  const mount = binding.mount(
    mountpoint,
    (request) => {
      if (request.operation === 'interrupt') {
        interrupt(request.id);
        return;
      }
      trace('inbound id=', request.id, 'op=', request.operation, 'inode=', 'inode' in request ? request.inode : '-', 'offset=', 'offset' in request ? request.offset : '-', 'length=', 'length' in request ? request.length : '-');
      const operations = request.operation === 'lifetime' ? lifetime(request) : [settle(request)];
      for (const operation of operations) {
        track(operation);
      }
    },
    failed,
  );
  return {
    [Symbol.asyncDispose]: async () => {
      disposal ??= (async () => {
        close(new Error('Shell projection mount closed.'));
        await Promise.allSettled(pending);
        if (failures.length > 0) {
          throw new AggregateError(failures, 'Shell projection callbacks failed.');
        }
      })();
      return disposal;
    },
  };
};
