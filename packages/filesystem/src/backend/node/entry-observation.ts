import fs from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { assertRootedPath } from '@taucad/utils/path';
import type { PathPolicy } from '#types.js';
import type { EntryIdentity, EntryObservation, ObserveEntryInput } from '#backend/node/host.js';

const failure = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code, applicationState: 'known-not-applied' });
const stale = (): Error => failure('ESTALE', 'Entry changed during admitted observation; reacquire it.');
const unsupported = (): Error =>
  failure(
    'EOPNOTSUPP',
    'Descriptor-relative entry observation requires Linux procfs; no ambient-path fallback is available.',
  );
const descriptorPath = (handle: FileHandle): string => `/proc/self/fd/${handle.fd}`;
const directoryFlags = constants.O_RDONLY + constants.O_DIRECTORY + constants.O_NOFOLLOW;
const sameEntry = (left: BigIntStats, right: BigIntStats): boolean =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.mode === right.mode &&
  left.ctimeNs === right.ctimeNs &&
  left.birthtimeNs === right.birthtimeNs;
const sameDirectory = (left: BigIntStats, right: BigIntStats): boolean =>
  left.dev === right.dev && left.ino === right.ino && left.birthtimeNs === right.birthtimeNs;

/** Read a regular open descriptor without allocating beyond its admitted size, plus a one-byte growth probe. @internal */
export const readBoundedDescriptor = async (
  handle: FileHandle,
  maximumBytes: number,
  check: () => void,
): Promise<Uint8Array<ArrayBuffer>> => {
  check();
  const before = await handle.stat({ bigint: true });
  check();
  if (!before.isFile()) {
    throw failure('EOPNOTSUPP', 'Only regular files have bounded byte observations.');
  }
  if (before.size > BigInt(maximumBytes)) {
    throw failure('EFBIG', 'File exceeds the remaining observation byte allowance.');
  }
  const bytes = new Uint8Array(Number(before.size));
  let offset = 0;
  while (offset < bytes.length) {
    check();
    // oxlint-disable-next-line no-await-in-loop -- A single descriptor fills one admitted allocation sequentially.
    const { bytesRead } = await handle.read(bytes, offset, Math.min(64 * 1024, bytes.length - offset), offset);
    if (bytesRead === 0) {
      throw stale();
    }
    offset += bytesRead;
  }
  check();
  const { bytesRead } = await handle.read(new Uint8Array(1), 0, 1, offset);
  check();
  if (bytesRead !== 0) {
    throw failure('EFBIG', 'File grew beyond its admitted observation size.');
  }
  if (!sameEntry(before, await handle.stat({ bigint: true }))) {
    throw stale();
  }
  check();
  return bytes;
};

type Budget = { bytes: number; entries: number; check(): void };
const spendBytes = (budget: Budget, bytes: number): void => {
  if (bytes > budget.bytes) {
    throw failure('EFBIG', 'Entry exceeds the remaining observation byte allowance.');
  }
  budget.bytes -= bytes;
};
const spendEntry = (budget: Budget): void => {
  if (budget.entries === 0) {
    throw failure('EOVERFLOW', 'Entry exceeds the remaining observation entry allowance.');
  }
  budget.entries -= 1;
};

type Anchor = { handle: FileHandle; identity: BigIntStats; name: string };
type Located = {
  absolute: string;
  rooted: string;
  stats: BigIntStats | undefined;
  anchors: Anchor[];
  links: ReadonlyMap<string, EntryIdentity>;
};
type ObserverOptions = { root: string; policy?: PathPolicy };

/** Package-private owner of descriptor-relative observation and publication; never handed to a scope caller. @internal */
export type EntryObserver = {
  observe(input: ObserveEntryInput, check: () => void): Promise<EntryObservation>;
  rename(input: {
    from: string;
    to: string;
    source: EntryObservation;
    destination: EntryObservation;
    entries: ReadonlyMap<string, EntryObservation>;
    maximumBytes: number;
    maximumEntries: number;
    signal: AbortSignal | undefined;
    check(): Promise<void>;
  }): Promise<void>;
};

/** Construct a provider-bound observer without opening descriptors until the first operation. @internal */
export const createEntryObserver = (options: ObserverOptions): EntryObserver => {
  const salt = randomUUID();
  const identity = (stats: BigIntStats): EntryIdentity => {
    // The private brand is minted only from a provider salt and native no-follow identity/version facts.
    return createHash('sha256')
      .update(`${salt}:${stats.dev}:${stats.ino}:${stats.birthtimeNs}:${stats.ctimeNs}:${stats.mode}`)
      .digest('hex') as EntryIdentity;
  };
  const close = async (anchors: Anchor[]): Promise<void> => {
    const failures: unknown[] = [];
    for (const anchor of anchors.reverse()) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Attempt every nested descriptor before its parent even when a close fails.
        await anchor.handle.close();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Entry observation descriptor cleanup failed.');
    }
  };
  const validate = async (anchors: Anchor[]): Promise<void> => {
    let parent = options.root;
    for (const anchor of anchors) {
      // oxlint-disable-next-line no-await-in-loop -- Each component is compared against its pinned parent, never an ambient descendant path.
      const current = await fs.lstat(parent, { bigint: true });
      if (!sameDirectory(anchor.identity, current) || current.isSymbolicLink()) {
        throw stale();
      }
      parent = descriptorPath(anchor.handle);
      const next = anchors[anchors.indexOf(anchor) + 1];
      if (next !== undefined) {
        parent += `/${next.name}`;
      }
    }
  };
  const readLink = async (
    located: Pick<Located, 'absolute' | 'stats'>,
    budget: Budget,
  ): Promise<Uint8Array<ArrayBuffer>> => {
    const before = located.stats;
    if (before === undefined || !before.isSymbolicLink()) {
      throw stale();
    }
    // Linux libuv readlink uses PATH_MAX scratch (4096 + terminator), independently of caller payload allowance.
    // Refuse magic/unknown-size links and truncated results rather than treating them as ordinary authored links.
    if (before.size <= 0n || before.size >= 4096n) {
      throw unsupported();
    }
    spendBytes(budget, Number(before.size));
    budget.check();
    const bytes = await fs.readlink(located.absolute, { encoding: 'buffer' });
    budget.check();
    if (
      BigInt(bytes.length) !== before.size ||
      !sameEntry(before, await fs.lstat(located.absolute, { bigint: true }))
    ) {
      throw stale();
    }
    return new Uint8Array(bytes);
  };
  const targetParts = (bytes: Uint8Array<ArrayBuffer>): string[] => {
    let target: string;
    try {
      target = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw failure('EOPNOTSUPP', 'Non-UTF-8 link targets cannot be represented in the rooted namespace.');
    }
    // oxlint-disable-next-line no-control-regex -- Rooted paths deliberately refuse control bytes in stored link text.
    if (target.includes('\\') || /[\u0000-\u001F\u007F]/u.test(target)) {
      throw failure('EOPNOTSUPP', 'Link target is outside the rooted path grammar.');
    }
    if (target.startsWith('/')) {
      if (target !== options.root && !target.startsWith(`${options.root}/`)) {
        throw failure('ELOOP', 'Symbolic link target escapes its admitted root.');
      }
      return ['', ...target.slice(options.root.length + 1).split('/')];
    }
    return target.split('/');
  };
  const locate = async (
    rooted: string,
    budget: Budget,
    request: { followFinal?: boolean; targets?: string[] } = {},
  ): Promise<Located> => {
    const { targets } = request;
    if (process.platform !== 'linux') {
      throw unsupported();
    }
    assertRootedPath(rooted);
    if (Buffer.byteLength(rooted) > 4096) {
      throw failure('EFBIG', 'Rooted path exceeds bounded traversal scratch.');
    }
    budget.check();
    const anchors: Anchor[] = [];
    const linkDependencies = new Map<string, EntryIdentity>();
    try {
      const root = await fs.open(options.root, directoryFlags);
      let rootStats: BigIntStats;
      try {
        rootStats = await root.stat({ bigint: true });
      } catch (error) {
        await root.close();
        throw error;
      }
      anchors.push({ handle: root, identity: rootStats, name: '' });
      // This must be the real kernel descriptor directory, not a similarly named ambient file.
      try {
        if (!sameDirectory(rootStats, await fs.stat(descriptorPath(root), { bigint: true }))) {
          throw unsupported();
        }
      } catch {
        throw unsupported();
      }
      const pending = rooted === '' ? [] : rooted.split('/');
      const resolved: string[] = [];
      let links = 0;
      let tracking = false;
      for (;;) {
        budget.check();
        const segment = pending.shift();
        const parent = anchors.at(-1)!;
        if (segment === undefined) {
          return {
            absolute: `${descriptorPath(parent.handle)}/.`,
            rooted: resolved.join('/'),
            // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
            stats: await parent.handle.stat({ bigint: true }),
            anchors,
            links: linkDependencies,
          };
        }
        if (segment === '' || segment === '.') {
          continue;
        }
        if (segment === '..') {
          if (anchors.length === 1) {
            throw failure('ELOOP', 'Symbolic link target escapes its admitted root.');
          }
          const previous = anchors.pop()!;
          // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
          await previous.handle.close();
          resolved.pop();
          continue;
        }
        const candidate = [...resolved, segment].join('/');
        assertRootedPath(candidate);
        if (tracking) {
          spendEntry(budget);
          spendBytes(budget, Buffer.byteLength(candidate));
          targets?.push(candidate);
          if (options.policy?.classify(candidate).agentAccess === 'hidden') {
            throw failure('ELOOP', 'Symbolic link target is hidden by the root policy.');
          }
        }
        const absolute = `${descriptorPath(parent.handle)}/${segment}`;
        let stats: BigIntStats | undefined;
        try {
          // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
          stats = await fs.lstat(absolute, { bigint: true });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT' && pending.length === 0) {
            return { absolute, rooted: candidate, stats: undefined, anchors, links: linkDependencies };
          }
          throw error;
        }
        if (stats.isSymbolicLink() && (request.followFinal === true || pending.length > 0)) {
          if (++links > 40) {
            throw failure('ELOOP', 'Symbolic link resolution exceeds its hop bound.');
          }
          linkDependencies.set(candidate, identity(stats));
          // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
          const bytes = await readLink({ absolute, stats }, budget);
          const parts = targetParts(bytes);
          if (parts[0] === '') {
            parts.shift();
            while (anchors.length > 1) {
              // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
              await anchors.pop()!.handle.close();
            }
            resolved.length = 0;
          }
          pending.unshift(...parts);
          tracking = true;
          continue;
        }
        if (pending.length === 0) {
          return { absolute, rooted: candidate, stats, anchors, links: linkDependencies };
        }
        if (!stats.isDirectory()) {
          throw failure('ENOTDIR', 'An observed path ancestor is not a directory.');
        }
        // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
        const handle = await fs.open(absolute, directoryFlags);
        // Track the descriptor before stat can reject; its observed identity is validated before traversal continues.
        anchors.push({ handle, identity: stats, name: segment });
        // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
        const opened = await handle.stat({ bigint: true });
        if (!sameDirectory(stats, opened)) {
          throw stale();
        }
        resolved.push(segment);
      }
    } catch (error) {
      try {
        await close(anchors);
      } catch (cleanupError) {
        if (!(error instanceof Error)) {
          throw new AggregateError([error, cleanupError], 'Entry observation and descriptor cleanup failed.');
        }
        // Keep the operation's error/code primary while retaining both its original cause and cleanup evidence.
        error.cause = new AggregateError(
          error.cause === undefined ? [cleanupError] : [error.cause, cleanupError],
          'Entry observation cleanup also failed.',
        );
      }
      throw error;
    }
  };
  const validateLocated = async (located: Located, budget: Budget): Promise<void> => {
    await validate(located.anchors);
    for (const [candidate, expected] of located.links) {
      budget.check();
      // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
      const current = await locate(candidate, budget);
      try {
        // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
        await validate(current.anchors);
        if (current.stats === undefined || identity(current.stats) !== expected) {
          throw stale();
        }
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
        await close(current.anchors);
      }
    }
  };
  const observe = async (input: ObserveEntryInput, check: () => void): Promise<EntryObservation> => {
    const budget: Budget = {
      bytes: input.maximumBytes,
      entries: input.maximumEntries,
      check: () => {
        check();
        input.signal?.throwIfAborted();
      },
    };
    if (
      !Number.isSafeInteger(budget.bytes) ||
      budget.bytes < 0 ||
      !Number.isSafeInteger(budget.entries) ||
      budget.entries < 0
    ) {
      throw new TypeError('Observation bounds must be nonnegative safe integers.');
    }
    budget.check();
    const located = await locate(input.path, budget);
    try {
      const { stats } = located;
      if (stats === undefined) {
        await validateLocated(located, budget);
        budget.check();
        return { kind: 'absent' };
      }
      const entryIdentity = identity(stats);
      if (stats.isSymbolicLink()) {
        const targetBytes = await readLink(located, budget);
        const targets: string[] = [];
        // Resolve from the source spelling so relative targets preserve native component-by-component semantics.
        const target = await locate(input.path, budget, { followFinal: true, targets });
        try {
          await validateLocated(target, budget);
          if (targets.at(-1) !== target.rooted) {
            spendEntry(budget);
            spendBytes(budget, Buffer.byteLength(target.rooted));
            targets.push(target.rooted);
          }
        } finally {
          await close(target.anchors);
        }
        if (!sameEntry(stats, await fs.lstat(located.absolute, { bigint: true }))) {
          throw stale();
        }
        await validateLocated(located, budget);
        budget.check();
        return { kind: 'symlink', identity: entryIdentity, targetBytes, targets };
      }
      if (!stats.isFile() && !stats.isDirectory()) {
        throw failure('EOPNOTSUPP', 'Special entries cannot be projected as ordinary files.');
      }
      const handle = await fs.open(
        located.absolute,
        constants.O_RDONLY +
          constants.O_NOFOLLOW +
          (constants.O_NONBLOCK + (stats.isDirectory() ? constants.O_DIRECTORY : 0)),
      );
      try {
        if (!sameEntry(stats, await handle.stat({ bigint: true }))) {
          throw stale();
        }
        await validateLocated(located, budget);
        budget.check();
        if (stats.isFile()) {
          const bytes = await readBoundedDescriptor(handle, budget.bytes, budget.check);
          await validateLocated(located, budget);
          if (!sameEntry(stats, await fs.lstat(located.absolute, { bigint: true }))) {
            throw stale();
          }
          budget.check();
          return { kind: 'file', identity: entryIdentity, bytes };
        }
        const names: string[] = [];
        const directory = await fs.opendir(descriptorPath(handle), { bufferSize: 1 });
        try {
          for (;;) {
            budget.check();
            // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
            const entry = await directory.read();
            if (entry === null) {
              break;
            }
            spendEntry(budget);
            spendBytes(budget, Buffer.byteLength(entry.name));
            names.push(entry.name);
          }
        } finally {
          await directory.close();
        }
        if (!sameEntry(stats, await handle.stat({ bigint: true }))) {
          throw stale();
        }
        await validateLocated(located, budget);
        budget.check();
        return { kind: 'directory', identity: entryIdentity, names };
      } finally {
        await handle.close();
      }
    } finally {
      await close(located.anchors);
    }
  };
  return {
    observe,
    rename: async (input) => {
      const budget: Budget = {
        bytes: input.maximumBytes,
        entries: input.maximumEntries,
        check: () => input.signal?.throwIfAborted(),
      };
      await input.check();
      const dependencies = new Map<string, EntryIdentity | undefined>();
      const inside = (parent: string, child: string): boolean => parent === child || child.startsWith(`${parent}/`);
      // Resolve the post-rename namespace without publishing it: names below the destination read the source subtree.
      const prospectiveTarget = async (linkPath: string, linkBytes: Uint8Array<ArrayBuffer>): Promise<void> => {
        const resolved = linkPath.split('/').slice(0, -1);
        const pending = targetParts(linkBytes);
        if (pending[0] === '') {
          pending.shift();
          resolved.length = 0;
        }
        let hops = 0;
        for (;;) {
          const segment = pending.shift();
          if (segment === undefined) {
            return;
          }
          if (segment === '' || segment === '.') {
            continue;
          }
          if (segment === '..') {
            if (resolved.length === 0) {
              throw failure('ELOOP', 'Prospective link target escapes its admitted root.');
            }
            resolved.pop();
            continue;
          }
          const candidate = [...resolved, segment].join('/');
          assertRootedPath(candidate);
          spendEntry(budget);
          spendBytes(budget, Buffer.byteLength(candidate));
          if (options.policy?.classify(candidate).agentAccess === 'hidden') {
            throw failure('ELOOP', 'Prospective link target is hidden by the root policy.');
          }
          const actual = inside(input.to, candidate)
            ? input.from + candidate.slice(input.to.length)
            : inside(input.from, candidate)
              ? undefined
              : candidate;
          if (actual === undefined) {
            throw failure('EOPNOTSUPP', 'Prospective link target disappears during the rename.');
          }
          // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
          const target = await locate(actual, budget);
          try {
            // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
            await validate(target.anchors);
            if (target.stats === undefined) {
              dependencies.set(actual, undefined);
              if (pending.length > 0) {
                throw failure('ENOENT', 'Prospective link target parent does not exist.');
              }
              return;
            }
            dependencies.set(actual, identity(target.stats));
            if (target.stats.isSymbolicLink()) {
              if (++hops > 40) {
                throw failure('ELOOP', 'Prospective link resolution exceeds its hop bound.');
              }
              // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
              const parts = targetParts(await readLink(target, budget));
              if (parts[0] === '') {
                parts.shift();
                resolved.length = 0;
              }
              pending.unshift(...parts);
            } else {
              if (pending.length > 0 && !target.stats.isDirectory()) {
                throw failure('ENOTDIR', 'Prospective link target ancestor is not a directory.');
              }
              resolved.push(segment);
            }
          } finally {
            // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
            await close(target.anchors);
          }
        }
      };
      for (const [candidate, entry] of input.entries) {
        if (entry.kind === 'symlink' && inside(input.from, candidate)) {
          // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
          await prospectiveTarget(input.to + candidate.slice(input.from.length), entry.targetBytes);
        }
      }
      const source = await locate(input.from, budget);
      try {
        const destination = await locate(input.to, budget);
        try {
          await validate(source.anchors);
          await validate(destination.anchors);
          if (
            source.stats === undefined ||
            input.source.kind === 'absent' ||
            identity(source.stats) !== input.source.identity
          ) {
            throw stale();
          }
          if (
            destination.stats === undefined
              ? input.destination.kind !== 'absent'
              : input.destination.kind === 'absent' || identity(destination.stats) !== input.destination.identity
          ) {
            throw stale();
          }
          await input.check();
          // Re-admit every observed entry and target dependency after the writer check, before the one native rename.
          // External writers are not serialized: this is checked publication, not cross-process atomic CAS.
          for (const [candidate, entry] of input.entries) {
            dependencies.set(candidate, entry.kind === 'absent' ? undefined : entry.identity);
          }
          for (const [candidate, expected] of dependencies) {
            // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
            const current = await locate(candidate, budget);
            try {
              // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
              await validate(current.anchors);
              if ((current.stats === undefined ? undefined : identity(current.stats)) !== expected) {
                throw stale();
              }
            } finally {
              // oxlint-disable-next-line no-await-in-loop -- Sequential native reads preserve the shared bound and descriptor dependency order.
              await close(current.anchors);
            }
          }
          if (!sameEntry(source.stats, await fs.lstat(source.absolute, { bigint: true }))) {
            throw stale();
          }
          await validate(source.anchors);
          await validate(destination.anchors);
          await fs.rename(source.absolute, destination.absolute);
          // Both parent descriptors are still pinned; persist the directory-entry update before reporting applied.
          await source.anchors.at(-1)!.handle.sync();
          await destination.anchors.at(-1)!.handle.sync();
        } finally {
          await close(destination.anchors);
        }
      } finally {
        await close(source.anchors);
      }
    },
  };
};
