import { mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NodeFsRootRun, NodeFsRootScope } from '@taucad/filesystem/backend/node';
import {
  publishShellProjectionEntry,
  publishShellProjectionFile,
  shellProjectionAccess,
  shellProjectionGrantSet,
} from '#shell/shell-projection.js';
import type { ShellProjectionGrants } from '#shell/shell-projection.js';

const isMissing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';

/**
 * Persist directory entries before acknowledging a recoverable conflict.
 * @param directory - Private journal directory whose entries must reach stable storage.
 */
const syncDirectory = async (directory: string): Promise<void> => {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

/** One kernel request as the private transport delivers it; only the fields the owner reads. @internal */
export type ShellProjectionOwnerRequest = Readonly<{
  operation: string;
  inode: bigint;
  destinationParent: bigint;
  lookupCount: bigint;
  offset: number;
  length: number;
  flags: number;
  attributes: number;
  name?: string;
  destinationName?: string;
  data?: Uint8Array<ArrayBuffer>;
}>;

/** The owner's answer; the transport validates it before the kernel sees it. @internal */
export type ShellProjectionOwnerReply = Readonly<{
  error?: number;
  entry?: Readonly<{ inode: bigint; mode: number; size: number; links: number }>;
  handle?: bigint;
  bytes?: Uint8Array<ArrayBuffer>;
  written?: number;
  entries?: ReadonlyArray<Readonly<{ name: string; inode: bigint; mode: number }>>;
  /** Inodes whose cached pages the transport drops after the reply: a refused write never stays in a mapping. */
  invalidate?: readonly bigint[];
}>;

/** Bytes of one file, or `null` when it is absent: the checked-write absence sentinel. @internal */
// oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
export type ShellProjectionBytes = Uint8Array<ArrayBuffer> | null;

/** One retained conflict: the shell's bytes, and what the authority held instead. Never retried. @internal */
export type ShellProjectionConflict = Readonly<{
  sequence: number;
  path: string;
  baseline: ShellProjectionBytes;
  shell: ShellProjectionBytes;
  authority: ShellProjectionBytes | 'directory';
}>;

/** The owner's storage accounting, in bytes. @internal */
export type ShellProjectionUsage = Readonly<{ live: number; retired: number; journal: number; total: number }>;

/** A projection owner over one held root claim. Nothing activates it; the caller wires it to a transport. @internal */
export type ShellProjectionOwner = Readonly<{
  handle: (request: ShellProjectionOwnerRequest) => Promise<ShellProjectionOwnerReply>;
  conflicts: () => readonly ShellProjectionConflict[];
  usage: () => ShellProjectionUsage;
}>;

/** Errno answers. A conflict answers ESTALE: the file changed under the shell, and its bytes are journaled. */
const errno = { noent: 2, io: 5, access: 13, exist: 17, invalid: 22, nospace: 28, nosys: 38, stale: 116 } as const;

type Generation = {
  /** Root-relative name, or undefined once replaced or removed (retained until the kernel forgets it). */
  path: string | undefined;
  /** The name this generation was last published under, kept for its journal record. */
  origin: string;
  /** True once newer authority bytes replaced it at its name: its writes are conflicts, never publications. */
  superseded: boolean;
  directory: boolean;
  /** What the shell sees for this generation. */
  bytes: Uint8Array<ArrayBuffer>;
  /** The authority bytes this generation last agreed with; every publication is preconditioned on it. */
  baseline: ShellProjectionBytes;
  lookups: bigint;
  opens: number;
};

const empty = (): Uint8Array<ArrayBuffer> => new Uint8Array(0);
const equal = (left: ShellProjectionBytes, right: ShellProjectionBytes): boolean =>
  left === right || (left !== null && right !== null && Buffer.compare(left, right) === 0);
const join_ = (parent: string, name: string): string => (parent === '' ? name : `${parent}/${name}`);

/**
 * Open the projection owner for one admitted checkout inside its held root claim.
 *
 * Capture copies the visible tree (authored, cache and records; hidden names are absent) and charges it to the
 * quota before any request is served. Every lookup revalidates the name against the authority: newer authority
 * bytes become a new inode generation at that name, while descriptors already open keep their own generation,
 * which is never overwritten. Every mutation publishes through the held scope with the generation's baseline as
 * its precondition. A conflict keeps both the shell's bytes and the authority's in a bounded journal under the
 * private run root, answers the shell ESTALE, and is never retried against the newer baseline.
 *
 * The quota bounds live generations, retired generations still referenced by the kernel, and journal bytes.
 * Growth that would cross it is refused with ENOSPC before anything is staged or published.
 *
 * Coherence (F4): a descriptor or mapping keeps the generation it opened, and an inbound version is a new inode,
 * so no cached page is ever overwritten from outside. A refused write, truncation or mapping writeback asks the
 * transport to drop that inode's cached pages, so the shell sees the generation's accepted bytes again.
 *
 * Authority (D8): the owner decides nothing from the path registry alone. Its launch's grant set is normalized
 * once here and composed with the registry by {@link shellProjectionAccess} for every name it captures, lists,
 * reports a mode for or publishes, so the projection shows and writes exactly what that launch was granted.
 * A name the grant set does not reach is absent, and a name it grants read-only is reported read-only.
 *
 * @internal
 * @param options - The served owner's root claim and admitted root, the launch's authority grant set, the byte
 * quota, and the private journal directory, which the shell never sees.
 * @returns The request handler and read-only views of its journal and accounting.
 */
export const openShellProjectionOwner = async (
  options: Readonly<{
    run: NodeFsRootRun;
    root: string;
    grants: ShellProjectionGrants;
    quotaBytes: number;
    journalDirectory: string;
  }>,
): Promise<ShellProjectionOwner> => {
  if (!Number.isSafeInteger(options.quotaBytes) || options.quotaBytes < 0) {
    throw new TypeError('The shell projection quota must be a nonnegative safe integer.');
  }
  /* One normalization for the whole mount: a grant root nobody can place throws here, before a single request is
   * served, rather than being narrowed silently at the first name that touches it. */
  const grants = shellProjectionGrantSet(options.grants);
  const access = (path: string): ReturnType<typeof shellProjectionAccess> => shellProjectionAccess(grants, path);
  const generations = new Map<bigint, Generation>([
    [
      1n,
      {
        path: '',
        origin: '',
        superseded: false,
        directory: true,
        bytes: empty(),
        baseline: null,
        lookups: 1n,
        opens: 0,
      },
    ],
  ]);
  const names = new Map<string, bigint>([['', 1n]]);
  const journal: ShellProjectionConflict[] = [];
  let journalBytes = 0;
  let liveBytes = 0;
  let retiredBytes = 0;
  let next = 2n;
  /* The accounts are carried, not recomputed: one capture or publication charges only the generation it touches,
   * so admitting a checkout costs one pass over it rather than one pass per entry. Every change to a generation's
   * bytes, name or membership is bracketed by `uncharge` and `charge`, which are the only writers of either sum. */
  const uncharge = (generation: Generation): void => {
    if (generation.path === undefined) {
      retiredBytes -= generation.bytes.length;
    } else {
      liveBytes -= generation.bytes.length;
    }
  };
  const charge = (generation: Generation): void => {
    if (generation.path === undefined) {
      retiredBytes += generation.bytes.length;
    } else {
      liveBytes += generation.bytes.length;
    }
  };
  const live = (): number => liveBytes;
  const retired = (): number => retiredBytes;
  const total = (): number => liveBytes + retiredBytes + journalBytes;
  const fits = (growth: number): boolean => total() + growth <= options.quotaBytes;

  const mint = (path: string, directory: boolean, bytes: Uint8Array<ArrayBuffer>): bigint => {
    const inode = next++;
    const generation: Generation = {
      path,
      origin: path,
      superseded: false,
      directory,
      bytes,
      baseline: directory ? null : bytes,
      lookups: 0n,
      opens: 0,
    };
    generations.set(inode, generation);
    names.set(path, inode);
    charge(generation);
    return inode;
  };
  const retire = (inode: bigint, superseded = false): void => {
    const generation = generations.get(inode);
    if (generation === undefined) {
      return;
    }
    uncharge(generation);
    generation.superseded = superseded;
    if (generation.path !== undefined && names.get(generation.path) === inode) {
      names.delete(generation.path);
    }
    generation.path = undefined;
    if (generation.lookups === 0n && generation.opens === 0) {
      generations.delete(inode);
      return;
    }
    charge(generation);
  };
  /** Drop one generation the kernel has finished with; a retired one is still charged until it goes. */
  const forgotten = (inode: bigint, generation: Generation): void => {
    if (generation.path === undefined && generation.lookups === 0n && generation.opens === 0) {
      uncharge(generation);
      generations.delete(inode);
    }
  };
  const visible = (path: string): boolean => access(path) !== 'denied';
  const mode = (generation: Generation): number => {
    const writable = generation.path === undefined || access(generation.path) === 'read-write';
    if (generation.directory) {
      return writable || generation.path === '' ? 0o4_0700 : 0o4_0500;
    }
    return writable ? 0o10_0600 : 0o10_0400;
  };
  const entry = (inode: bigint, generation: Generation) => ({
    inode,
    mode: mode(generation),
    size: generation.bytes.length,
    links: 1,
  });

  /* Every request runs inside its own held root claim, so editor saves interleave between requests rather than
   * waiting for the mount to end, and each publication sees the authority's bytes at that instant (PO-Q5). */
  const bound = (scope: NodeFsRootScope) => {
    const capture = async (path: string): Promise<void> => {
      for (const name of await scope.readdir(path)) {
        const child = join_(path, name);
        if (!visible(child)) {
          continue;
        }
        // eslint-disable-next-line no-await-in-loop -- Capture walks the held claim's tree in order.
        const status = await scope.stat(child);
        if (status.type === 'dir') {
          mint(child, true, empty());
          // eslint-disable-next-line no-await-in-loop -- Depth-first capture under one claim.
          await capture(child);
          continue;
        }
        // eslint-disable-next-line no-await-in-loop -- Each file is copied once under the claim.
        const bytes = new Uint8Array(await scope.readFile(child));
        if (!fits(bytes.length)) {
          throw Object.assign(new Error('The checkout does not fit the shell projection quota.'), { code: 'ENOSPC' });
        }
        mint(child, false, bytes);
      }
    };

    const record = async (
      generation: Generation,
      { path, shell, authority }: Readonly<Pick<ShellProjectionConflict, 'path' | 'shell' | 'authority'>>,
    ): Promise<number> => {
      const size = (shell?.length ?? 0) + (authority instanceof Uint8Array ? authority.length : 0);
      if (!fits(size)) {
        return errno.nospace;
      }
      const conflict: ShellProjectionConflict = {
        sequence: journal.length + 1,
        path,
        baseline: generation.baseline,
        shell,
        authority,
      };
      const directory = join(options.journalDirectory, String(conflict.sequence));
      await mkdir(directory, { mode: 0o700 });
      await writeFile(join(directory, 'shell'), shell ?? empty(), { mode: 0o600, flush: true });
      await writeFile(join(directory, 'authority'), authority instanceof Uint8Array ? authority : empty(), {
        mode: 0o600,
        flush: true,
      });
      await writeFile(
        join(directory, 'record.json'),
        JSON.stringify({
          path,
          shell: shell === null ? 'absent' : 'bytes',
          authority: authority instanceof Uint8Array ? 'bytes' : (authority ?? 'absent'),
        }),
        { mode: 0o600, flush: true },
      );
      await syncDirectory(directory);
      await syncDirectory(options.journalDirectory);
      journal.push(conflict);
      journalBytes += size;
      return errno.stale;
    };

    /** Publish one generation's new bytes. Success advances its baseline; a conflict is journaled, never retried. */
    const publish = async (generation: Generation, projected: ShellProjectionBytes): Promise<number | undefined> => {
      const { path } = generation;
      if (generation.superseded) {
        // Newer authority bytes replaced this generation: keep both, answer the shell, never overwrite the save.
        let authority: ShellProjectionBytes = null;
        try {
          authority = new Uint8Array(await scope.readFile(generation.origin));
        } catch (error) {
          if (!isMissing(error)) {
            throw error;
          }
          authority = null;
        }
        return record(generation, { path: generation.origin, shell: projected, authority });
      }
      if (path === undefined) {
        // Removed by the shell itself but still open: like any unlinked file, its bytes stay local.
        return undefined;
      }
      const outcome = await publishShellProjectionFile(
        scope,
        { path, baseline: generation.baseline, projected },
        { grants, maximumBytes: options.quotaBytes, signal: scope.signal },
      );
      if (outcome.status === 'refused') {
        return outcome.reason === 'protected-path' ? errno.access : errno.nospace;
      }
      if (outcome.result.status === 'conflict') {
        const actual = outcome.result.conflicts.find((item) => item.path === path)?.actual ?? null;
        return record(generation, { path, shell: projected, authority: actual });
      }
      generation.baseline = projected;
      return undefined;
    };

    /** Revalidate one name against the authority; newer bytes become a new generation, never an overwrite. */
    const resolve = async (path: string): Promise<bigint | number> => {
      if (!visible(path)) {
        return errno.noent;
      }
      const current = names.get(path);
      const generation = current === undefined ? undefined : generations.get(current);
      let authority: ShellProjectionBytes;
      try {
        const status = await scope.stat(path);
        if (status.type === 'dir') {
          if (generation?.directory === true && current !== undefined) {
            return current;
          }
          if (current !== undefined) {
            retire(current);
          }
          return mint(path, true, empty());
        }
        authority = new Uint8Array(await scope.readFile(path));
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
        authority = null;
      }
      if (authority === null) {
        if (current !== undefined) {
          retire(current, true);
        }
        return errno.noent;
      }
      if (current !== undefined && generation !== undefined && equal(authority, generation.baseline)) {
        return current;
      }
      if (!fits(authority.length)) {
        return errno.nospace;
      }
      if (current !== undefined) {
        retire(current, true);
      }
      return mint(path, false, authority);
    };

    const pathOf = (parent: bigint, name: string | undefined): string | undefined => {
      const base = generations.get(parent)?.path;
      return base === undefined || name === undefined ? undefined : join_(base, name);
    };

    const write = async (inode: bigint, projected: Uint8Array<ArrayBuffer>): Promise<number | undefined> => {
      const generation = generations.get(inode);
      if (generation === undefined || generation.directory) {
        return errno.noent;
      }
      if (!fits(projected.length - generation.bytes.length)) {
        return errno.nospace;
      }
      const failed = await publish(generation, projected);
      if (failed === undefined) {
        uncharge(generation);
        generation.bytes = projected;
        charge(generation);
      }
      return failed;
    };

    const create = async (
      request: ShellProjectionOwnerRequest,
      directory: boolean,
    ): Promise<ShellProjectionOwnerReply> => {
      const path = pathOf(request.inode, request.name);
      if (path === undefined) {
        return { error: errno.noent };
      }
      if (names.has(path)) {
        return { error: errno.exist };
      }
      if (directory) {
        const outcome = await publishShellProjectionEntry(
          scope,
          { kind: 'mkdir', path },
          { grants, signal: scope.signal },
        );
        if (outcome.status === 'refused') {
          return { error: errno.access };
        }
        if (outcome.result.status === 'conflict') {
          return { error: errno.exist };
        }
        const inode = mint(path, true, empty());
        const generation = generations.get(inode)!;
        generation.lookups++;
        return { entry: entry(inode, generation) };
      }
      const outcome = await publishShellProjectionFile(
        scope,
        { path, baseline: null, projected: empty() },
        { grants, maximumBytes: options.quotaBytes, signal: scope.signal },
      );
      if (outcome.status === 'refused') {
        return { error: outcome.reason === 'protected-path' ? errno.access : errno.nospace };
      }
      if (outcome.result.status === 'conflict') {
        return { error: errno.exist };
      }
      const inode = mint(path, false, empty());
      const generation = generations.get(inode)!;
      generation.lookups++;
      generation.opens++;
      return { entry: entry(inode, generation), handle: inode };
    };

    const remove = async (request: ShellProjectionOwnerRequest): Promise<ShellProjectionOwnerReply> => {
      const path = pathOf(request.inode, request.name);
      const inode = path === undefined ? undefined : names.get(path);
      const generation = inode === undefined ? undefined : generations.get(inode);
      if (path === undefined || inode === undefined || generation === undefined) {
        return { error: errno.noent };
      }
      if (generation.directory) {
        const outcome = await publishShellProjectionEntry(
          scope,
          { kind: 'rmdir', path },
          { grants, signal: scope.signal },
        );
        if (outcome.status === 'refused') {
          return { error: errno.access };
        }
        if (outcome.result.status === 'conflict') {
          return { error: errno.stale };
        }
      } else {
        const failed = await publish(generation, null);
        if (failed !== undefined) {
          return { error: failed };
        }
      }
      retire(inode);
      return {};
    };

    const rename = async (request: ShellProjectionOwnerRequest): Promise<ShellProjectionOwnerReply> => {
      const from = pathOf(request.inode, request.name);
      const to = pathOf(request.destinationParent, request.destinationName);
      const inode = from === undefined ? undefined : names.get(from);
      const generation = inode === undefined ? undefined : generations.get(inode);
      if (from === undefined || to === undefined || inode === undefined || generation === undefined) {
        return { error: errno.noent };
      }
      if (request.flags !== 0 && request.flags !== 1) {
        return { error: errno.invalid };
      }
      if (names.has(to)) {
        return { error: errno.exist };
      }
      const below = [...generations.entries()].filter(([, item]) => item.path?.startsWith(`${from}/`) === true);
      const files = generation.directory
        ? below.filter(([, item]) => !item.directory).map(([, item]) => item)
        : [generation];
      const outcome = await publishShellProjectionEntry(
        scope,
        {
          kind: 'rename',
          from,
          to,
          preconditions: [
            ...files.map((item) => ({ path: item.path!, expected: item.baseline })),
            { path: to, expected: null },
          ],
          descendants: below.map(([, item]) => item.path!.slice(from.length + 1)),
        },
        { grants, signal: scope.signal },
      );
      if (outcome.status === 'refused') {
        return { error: errno.access };
      }
      if (outcome.result.status === 'conflict') {
        return { error: errno.stale };
      }
      /* The moved generations are known by inode, so the new names are set from them rather than by rescanning
       * every generation for each one. Old names go first: a destination under the source would otherwise collide
       * with a name still held by an entry this move has not reached. */
      const moved: Array<readonly [bigint, Generation]> = [[inode, generation], ...below];
      for (const [, item] of moved) {
        names.delete(item.path!);
      }
      for (const [key, item] of moved) {
        item.path = `${to}${item.path!.slice(from.length)}`;
        item.origin = item.path;
        names.set(item.path, key);
      }
      return {};
    };

    const handle = async (request: ShellProjectionOwnerRequest): Promise<ShellProjectionOwnerReply> => {
      const reply = await answer(request);
      const content = request.operation === 'write' || request.operation === 'setattr' || request.operation === 'open';
      return content && reply.error !== undefined ? { ...reply, invalidate: [request.inode] } : reply;
    };

    const answer = async (request: ShellProjectionOwnerRequest): Promise<ShellProjectionOwnerReply> => {
      switch (request.operation) {
        case 'lookup': {
          const path = pathOf(request.inode, request.name);
          const inode = path === undefined ? errno.noent : await resolve(path);
          if (typeof inode === 'number') {
            return { error: inode };
          }
          const generation = generations.get(inode)!;
          generation.lookups++;
          return { entry: entry(inode, generation) };
        }
        case 'getattr': {
          const generation = generations.get(request.inode);
          return generation === undefined ? { error: errno.noent } : { entry: entry(request.inode, generation) };
        }
        case 'setattr': {
          const generation = generations.get(request.inode);
          if (generation === undefined) {
            return { error: errno.noent };
          }
          // FUSE_SET_ATTR_SIZE: truncation and extension publish like any write.
          if (Math.floor(request.attributes / 8) % 2 === 1) {
            const projected = new Uint8Array(request.offset);
            projected.set(generation.bytes.subarray(0, request.offset));
            const failed = await write(request.inode, projected);
            if (failed !== undefined) {
              return { error: failed };
            }
          }
          return { entry: entry(request.inode, generation) };
        }
        case 'open': {
          const generation = generations.get(request.inode);
          if (generation === undefined) {
            return { error: errno.noent };
          }
          // The bridge negotiates atomic O_TRUNC, so the truncation arrives here rather than as a setattr.
          if (Math.floor(request.flags / 0o1000) % 2 === 1 && generation.bytes.length > 0) {
            const failed = await write(request.inode, empty());
            if (failed !== undefined) {
              return { error: failed };
            }
          }
          generation.opens++;
          return { handle: request.inode };
        }
        case 'release': {
          const generation = generations.get(request.inode);
          if (generation !== undefined) {
            generation.opens = Math.max(0, generation.opens - 1);
            forgotten(request.inode, generation);
          }
          return {};
        }
        case 'forget': {
          const generation = generations.get(request.inode);
          if (generation !== undefined) {
            generation.lookups =
              generation.lookups > request.lookupCount ? generation.lookups - request.lookupCount : 0n;
            forgotten(request.inode, generation);
          }
          return {};
        }
        case 'read': {
          const bytes = generations.get(request.inode)?.bytes ?? empty();
          return { bytes: bytes.slice(request.offset, request.offset + request.length) };
        }
        case 'write': {
          const old = generations.get(request.inode)?.bytes ?? empty();
          const projected = new Uint8Array(Math.max(old.length, request.offset + request.length));
          projected.set(old);
          projected.set(request.data ?? [], request.offset);
          const failed = await write(request.inode, projected);
          return failed === undefined ? { written: request.length } : { error: failed };
        }
        case 'create': {
          return create(request, false);
        }
        case 'mkdir': {
          return create(request, true);
        }
        case 'unlink':
        case 'rmdir': {
          return remove(request);
        }
        case 'rename': {
          return rename(request);
        }
        case 'readdir': {
          const base = generations.get(request.inode)?.path;
          if (base === undefined) {
            return { error: errno.noent };
          }
          const prefix = base === '' ? '' : `${base}/`;
          if (request.offset === 0) {
            // Converge the listing with the authority: new names resolve in, vanished ones retire.
            const listed = await scope.readdir(base);
            const present = new Set(listed.map((name) => `${prefix}${name}`));
            const known = [...names.keys()].filter(
              (path) => path !== '' && path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
            );
            for (const path of new Set([...present, ...known])) {
              // eslint-disable-next-line no-await-in-loop -- One directory's names, revalidated in order.
              await resolve(path);
            }
          }
          const rows = [...names.entries()]
            .filter(([path]) => path !== '' && path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
            .map(([path, inode]) => ({
              name: path.slice(path.lastIndexOf('/') + 1),
              inode,
              mode: mode(generations.get(inode)!),
            }));
          return { entries: rows.slice(request.offset) };
        }
        case 'fsync': {
          return {};
        }
        default: {
          return { error: errno.nosys };
        }
      }
    };

    return { capture, handle };
  };
  await options.run({ root: options.root }, async (scope) => bound(scope).capture(''));
  await mkdir(options.journalDirectory, { recursive: true, mode: 0o700 });

  return {
    handle: async (request) => options.run({ root: options.root }, async (scope) => bound(scope).handle(request)),
    conflicts: () => [...journal],
    usage: () => ({ live: live(), retired: retired(), journal: journalBytes, total: total() }),
  };
};
