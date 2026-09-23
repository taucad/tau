/**
 * Host-side node filesystem provider. Owns `node:fs`, the bytes, and the
 * watchers; runs in the Electron services utility (or any plain Node peer).
 *
 * Never reachable from the browser barrel — it is published only through the
 * `@taucad/filesystem/backend/node` subpath, so `node:fs` cannot follow the
 * client half into the file-manager worker bundle.
 *
 * Adapted from `packages/runtime/src/transport/_internal/from-node-fs-handle.ts`
 * (containment `:100-113`, atomic temp + fsync + rename write `:129-206`,
 * symlink refusal, `stat`-classified watching `:249-432` — macOS reports plain
 * content writes as `rename`, so `eventType` is never trusted). Adapted rather
 * than reused for two reasons: the runtime handle is not a `FileSystemProvider`,
 * and it waives the `mkdir -p` parent contract every provider in this library
 * guarantees (`provider-tree-conformance.test.ts:75-136`).
 */

import fs from 'node:fs/promises';
import type { FSWatcher, Stats } from 'node:fs';
import { realpathSync, statSync, watch as watchDirectory } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { CheckedFileWrite, CheckedFileWriteResult } from '@taucad/types';
import { assertRootedPath, VirtualPathError } from '@taucad/utils/path';
import { AbstractFileSystemProvider } from '#backend/abstract-provider.js';
import { mapConcurrent, statConcurrency } from '#concurrency.js';
import type { NodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';
import { headSniffByteLength, seemsBinary, countLineBytes } from '#content-metadata.js';
import type {
  FileMode,
  FileReadStreamOptions,
  FileStat,
  PathPolicy,
  ProviderCapabilities,
  WatchRequest,
} from '#types.js';
import type { NodeFsWatchEvent } from '#backend/node/protocol.js';
import { streamChunkSize, validateFileReadStreamOptions } from '#backend/stream-utils.js';

/** The name `_atomicWrite` gives its temp file: `.<target>.<pid>.<uuid>.tmp`. */
const inFlightTemporaryName = /^\..+\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/u;

const isContained = (base: string, target: string): boolean => {
  const relative = path.relative(base, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
};

const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

type AuthorityCheckedWrite = (
  input: Omit<CheckedFileWrite, 'signal'>,
  assertCurrent: () => Promise<void>,
) => Promise<CheckedFileWriteResult>;

const authorityCheckedWrites = new WeakMap<NodeFsProvider, AuthorityCheckedWrite>();

/**
 * Normalize an `fs.watch` filename. Node types it as non-nullable, but the OS
 * genuinely drops it when it cannot describe the change — a loss signal, not a
 * no-op (`from-node-fs-handle.ts:56-61`).
 */
const toWatchedName = (filename: unknown): string | undefined => {
  if (typeof filename === 'string') {
    return filename;
  }
  return filename instanceof Uint8Array ? new TextDecoder().decode(filename) : undefined;
};

// oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
/** ponytail: prefix-only exclude matching, mirroring the runtime adapter's kernel contract. */
const isExcluded = (rootedPath: string, excludes: readonly string[]): boolean =>
  excludes.some((pattern) => {
    if (!pattern.endsWith('/**')) {
      return pattern === rootedPath;
    }
    const prefix = pattern.slice(0, -3);
    return rootedPath === prefix || rootedPath.startsWith(`${prefix}/`);
  });

const joinRooted = (base: string, child: string): string => (base === '' ? child : `${base}/${child}`);

/**
 * Disk-backed provider rooted at one absolute host directory.
 *
 * @public
 */
export class NodeFsProvider extends AbstractFileSystemProvider {
  public readonly capabilities: ProviderCapabilities = {
    persistent: true,
    writable: true,
    quotaBased: false,
    durability: 'transactional-rewrite',
  };

  private readonly _base: string;
  private readonly _policy: PathPolicy | undefined;
  private _realBaseCache: Promise<string> | undefined;
  // eslint-disable-next-line tau-lint/no-handrolled-fanout -- disposal registry, not pub/sub: these thunks are unsubscribes invoked once by dispose().
  private readonly _openSubscriptions = new Set<() => void>();

  /**
   * @param basePath - Host directory mapped to this provider's root. It must
   * already exist; the caller (the host) creates it.
   * @param options - The reserved layout an ordinary name may not resolve into
   * (D6, G0-6). This backend is the only one that can hold a symlink and the
   * only layer that knows where one points, so it refuses a laundered spelling
   * for every consumer above it; the policy is injected because the core never
   * imports the registry.
   */
  public constructor(basePath: string, options?: { readonly policy?: PathPolicy }) {
    super();
    this._base = path.resolve(basePath);
    this._policy = options?.policy;
    authorityCheckedWrites.set(this, async (input, assertCurrent) => this.#writeFileChecked(input, assertCurrent));
  }

  /**
   * Backend identifier carrying the physical root.
   * @returns `node:<absolute host path>`.
   */
  public get id(): string {
    return `node:${this._base}`;
  }

  /** Absolute host directory this provider is rooted at. @returns The root path. */
  public get root(): string {
    return this._base;
  }

  /**
   * Canonical root, resolved once and only when an operation needs it — an
   * eager `realpath` in the constructor becomes an unhandled rejection when a
   * provider outlives its directory without ever being used.
   */
  private get _realBase(): Promise<string> {
    this._realBaseCache ??= fs.realpath(this._base);
    return this._realBaseCache;
  }

  public async writeFile(path_: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
    this._assertRootedPath(path_);
    if (path_ === '') {
      throw this._eisdir(path_);
    }
    const target = await this._resolve(path_);
    const existingEntry = await this._lstatOrUndefined(target);
    if (existingEntry?.isDirectory() === true) {
      throw this._eisdir(path_);
    }
    // Every other provider creates missing parents on write; `fromNodeFs` waives it.
    await fs.mkdir(path.dirname(target), { recursive: true });
    await this._atomicWrite(path_, target, { data });
  }

  /** Direct providers do not own the cross-client authority needed for checked replacement. */
  public async writeFileChecked(_input: CheckedFileWrite): Promise<CheckedFileWriteResult> {
    throw Object.assign(new Error('Checked writes require a node filesystem authority owner.'), {
      code: 'CHECKED_WRITE_UNSUPPORTED',
      applicationState: 'known-not-applied',
    });
  }

  public async readdir(path_: string): Promise<string[]> {
    this._assertRootedPath(path_);
    const canonical = assertRootedPath(path_);
    const entries = await fs.readdir(await this._resolve(path_), { withFileTypes: true });
    /* An in-flight `_atomicWrite` parks `.<name>.<pid>.<uuid>.tmp` beside its
     * target for a few milliseconds. It is provider bookkeeping, not content:
     * a walker that lists it and then `stat`s it after the rename loses the
     * whole snapshot to ENOENT (seen by the desktop e2e's workspace admission
     * racing a parameter write). Keep it out of every listing. */
    const rows = entries.filter((entry) => !inFlightTemporaryName.test(entry.name));
    /* A link this provider will not serve is out of the listing for the same
     * reason: `_resolve` refuses it below, and a row every walker then `stat`s
     * would cost the caller the whole snapshot. Only link rows are probed — an
     * ordinary directory pays one `readdir` exactly as before — and they are
     * probed from the same bounded pool as the stats beside them: each probe is
     * an `lstat` walk plus a `realpath`, and a pnpm `node_modules` is thousands
     * of rows. */
    const refused = await mapConcurrent(rows, statConcurrency, async (entry) =>
      entry.isSymbolicLink() ? this._refusesLaunderedLink(canonical, entry.name) : false,
    );
    return rows.filter((_, index) => refused[index] !== true).map(({ name }) => name);
  }

  /**
   * Batched readdir + stat, so a cold index build pays one call per directory
   * instead of one per file — the whole saving on the port client, where each of
   * those was a round trip.
   *
   * Composed from this provider's own two primitives on purpose: the listing
   * keeps its temp-file and laundered-link refusals, each row keeps the stat
   * `_resolve` and the content sniff would have given it, and the answer is
   * `readdir` + `stat` by construction rather than by a second implementation.
   *
   * @param path_ - Absolute directory path to enumerate.
   * @returns Each entry's name paired with its stat metadata.
   */
  public async readdirWithStats(path_: string): Promise<Array<{ name: string } & FileStat>> {
    const names = await this.readdir(path_);
    return mapConcurrent(names, statConcurrency, async (name) => ({
      name,
      ...(await this.stat(joinRooted(path_, name))),
    }));
  }

  public async stat(path_: string): Promise<FileStat> {
    this._assertRootedPath(path_);
    const target = await this._resolve(path_);
    const stats = await fs.stat(target);
    if (stats.isDirectory()) {
      return { type: 'dir', size: stats.size, mtimeMs: stats.mtimeMs };
    }
    return {
      type: 'file',
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      ...(await this._contentMetadata(target, stats.size)),
    };
  }

  public async getFileMode(path_: string): Promise<FileMode> {
    this._assertRootedPath(path_);
    const stats = await fs.stat(await this._resolve(path_));
    if (!stats.isFile()) {
      throw this._einval(path_);
    }
    const permissions = stats.mode % 0o1000;
    const executable =
      Math.floor(permissions / 0o100) % 2 === 1 || Math.floor(permissions / 0o10) % 2 === 1 || permissions % 2 === 1;
    return executable ? '100755' : '100644';
  }

  public async setFileMode(path_: string, mode: FileMode): Promise<void> {
    this._assertRootedPath(path_);
    const target = await this._resolve(path_);
    const stats = await fs.stat(target);
    if (!stats.isFile()) {
      throw this._einval(path_);
    }
    await fs.chmod(target, mode === '100755' ? 0o755 : 0o644);
  }

  public async unlink(path_: string): Promise<void> {
    this._assertRootedPath(path_);
    const target = await this._resolve(path_);
    // MacOS answers `unlink` on a directory with EPERM; the library contract is EISDIR.
    const entry = await this._lstatOrUndefined(target);
    if (entry?.isDirectory() === true) {
      throw this._eisdir(path_);
    }
    await fs.unlink(target);
  }

  public async rmdir(path_: string): Promise<void> {
    this._assertRootedPath(path_);
    if (path_ === '') {
      // `fs.rmdir` would happily remove an empty root out from under this
      // provider. POSIX answers EINVAL for removing `.`; so does `rename` here.
      throw this._einval(path_);
    }
    await fs.rmdir(await this._resolve(path_));
  }

  public async rename(from: string, to: string): Promise<void> {
    this._assertRootedPath(from);
    this._assertRootedPath(to);
    if (from === '' || to === '') {
      throw this._einval(from === '' ? from : to);
    }
    if (from === to) {
      return;
    }
    if (to.startsWith(`${from}/`)) {
      throw this._einval(to);
    }
    const [resolvedFrom, resolvedTo] = await Promise.all([this._resolve(from), this._resolve(to)]);
    await fs.rename(resolvedFrom, resolvedTo);
  }

  /**
   * Subscribe to disk changes under this root.
   *
   * A requested path that is a directory reports its entries (its whole subtree
   * when `recursive`); a requested path that is a file — or does not exist yet —
   * reports that path. Classification is always by `stat`, never by the OS
   * `eventType`. Watcher loss and an unnameable change both emit `reset`.
   *
   * @param request - Root-relative paths and options to watch.
   * @param handler - Receives every event until the returned unsubscribe runs.
   * @returns Unsubscribe function.
   */
  public watch(request: WatchRequest, handler: (event: NodeFsWatchEvent) => void): () => void {
    const excludes = request.excludes ?? [];
    const watchers = new Set<FSWatcher>();
    const retired = new WeakSet<FSWatcher>();
    let unsubscribed = false;

    const emit = (event: NodeFsWatchEvent): void => {
      if (!unsubscribed && (event.type === 'reset' || !isExcluded(event.path, excludes))) {
        handler(event);
      }
    };

    const classify = (rootedPath: string, absolute: string): void => {
      try {
        emit({ type: 'change', path: rootedPath, kind: statSync(absolute).isDirectory() ? 'dir' : 'file' });
      } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        if (code === 'ENOENT' || code === 'ENOTDIR') {
          emit({ type: 'delete', path: rootedPath });
        }
        // Any other stat failure is the caller's to observe through its re-read.
      }
    };

    const open = (
      directory: string,
      recursive: boolean,
      onName: (name: string | undefined, self: FSWatcher) => void,
    ): void => {
      const watcher = watchDirectory(directory, { recursive });
      watchers.add(watcher);
      const lose = (): void => {
        if (unsubscribed || retired.has(watcher)) {
          return;
        }
        retired.add(watcher);
        watchers.delete(watcher);
        watcher.close();
        emit({ type: 'reset' });
      };
      watcher.on('change', (_eventType, filename) => {
        onName(toWatchedName(filename), watcher);
      });
      watcher.on('error', lose);
      watcher.on('close', lose);
    };

    // MacOS delivers recursive events against the resolved path; watching the
    // symlinked spelling (`/var/...` for `/private/var/...`) reports every
    // change as the root's own basename instead of the changed entry.
    let watchBase: string;
    try {
      watchBase = realpathSync(this._base);
    } catch {
      watchBase = this._base;
    }

    const register = (rootedPath: string): void => {
      const target = path.resolve(watchBase, rootedPath);
      if (!isContained(watchBase, target)) {
        throw new VirtualPathError('PATH_OUTSIDE_ROOT', rootedPath);
      }
      const targetIsDirectory = this._isDirectorySync(target);
      const desired = targetIsDirectory ? target : path.dirname(target);
      let directory = desired;
      while (!this._isDirectorySync(directory) && path.dirname(directory) !== directory) {
        directory = path.dirname(directory);
      }
      const pendingSegment = directory === desired ? undefined : path.relative(directory, desired).split(path.sep)[0];

      open(directory, targetIsDirectory && request.recursive === true, (name, self) => {
        if (unsubscribed) {
          return;
        }
        if (name === undefined) {
          emit({ type: 'reset' });
          return;
        }
        if (pendingSegment !== undefined) {
          if (name !== pendingSegment) {
            return;
          }
          // A gap directory appeared: re-arm onto it before classifying, or the
          // leaf's own creation is never observed (`from-node-fs-handle.ts:373-379`).
          retired.add(self);
          watchers.delete(self);
          self.close();
          register(rootedPath);
          classify(rootedPath, target);
          return;
        }
        if (targetIsDirectory) {
          const absolute = path.join(target, name);
          // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
          // ponytail: `fs.watch` on macOS emits one arming event naming the
          // watched directory itself. An entry that both carries that name and
          // does not exist is that artifact, not a deletion. A real child named
          // exactly after its parent directory would be indistinguishable; no
          // caller has one, and the resync path covers a missed delete.
          if (name === path.basename(target) && !this._existsSync(absolute)) {
            return;
          }
          classify(joinRooted(rootedPath, name.split(path.sep).join('/')), absolute);
          return;
        }
        if (name === path.basename(target)) {
          classify(rootedPath, target);
        }
      });
    };

    const unsubscribe = (): void => {
      unsubscribed = true;
      this._openSubscriptions.delete(unsubscribe);
      for (const watcher of watchers) {
        retired.add(watcher);
        watcher.close();
      }
      watchers.clear();
    };

    try {
      for (const requestedPath of request.paths) {
        const rootedPath = assertRootedPath(requestedPath);
        if (!isExcluded(rootedPath, excludes)) {
          register(rootedPath);
        }
      }
    } catch (error) {
      unsubscribe();
      throw error;
    }
    this._openSubscriptions.add(unsubscribe);
    return unsubscribe;
  }

  /** Close every watcher this provider opened. */
  public override dispose(): void {
    for (const unsubscribe of this._openSubscriptions) {
      unsubscribe();
    }
  }

  /** Open and read the file only as the consumer requests bounded chunks. */
  public readFileStream(path_: string, options?: FileReadStreamOptions): ReadableStream<Uint8Array<ArrayBuffer>> {
    this._assertRootedPath(path_);
    validateFileReadStreamOptions(options);
    const position = options?.position ?? 0;
    const length = options?.length;
    if (length !== undefined && position > Number.MAX_SAFE_INTEGER - length) {
      throw new RangeError('position plus length must not exceed the safe integer range.');
    }
    let offset = position;
    const end = length === undefined ? Number.MAX_SAFE_INTEGER : position + length;
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    let opening: Promise<Awaited<ReturnType<typeof fs.open>>> | undefined;
    let closing: Promise<void> | undefined;
    let closed = false;
    const isClosed = (): boolean => closed;
    const isAborted = (): boolean => options?.signal?.aborted === true;
    const close = async (): Promise<void> => {
      closed = true;
      options?.signal?.removeEventListener('abort', abort);
      closing ??= (async () => {
        const opened = handle ?? (await opening);
        await opened?.close();
        handle = undefined;
      })();
      await closing;
    };
    const closeAfterAbort = async (): Promise<void> => {
      try {
        await close();
        controller?.error(new DOMException('The operation was aborted.', 'AbortError'));
      } catch (error) {
        controller?.error(error);
      }
    };
    const closeAfterFailure = async (): Promise<void> => {
      try {
        await close();
      } catch {
        // Preserve the acquisition or read failure that required cleanup.
      }
    };
    let controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>> | undefined;
    const abort = (): void => {
      void closeAfterAbort();
    };
    return new ReadableStream(
      {
        start(controller_) {
          controller = controller_;
          options?.signal?.addEventListener('abort', abort, { once: true });
          if (options?.signal?.aborted) {
            abort();
          }
        },
        pull: async (controller) => {
          if (closed) {
            return;
          }
          if (offset >= end) {
            await close();
            controller.close();
            return;
          }
          try {
            opening ??= (async () => fs.open(await this._resolve(path_), 'r'))();
            handle ??= await opening;
            if (isClosed()) {
              return;
            }
            const requested = Math.min(streamChunkSize, end - offset);
            const chunk = new Uint8Array(requested);
            const { bytesRead } = await handle.read(chunk, 0, requested, offset);
            if (isClosed() || isAborted()) {
              return;
            }
            if (bytesRead === 0) {
              await close();
              controller.close();
              return;
            }
            offset += bytesRead;
            controller.enqueue(chunk.subarray(0, bytesRead));
          } catch (error) {
            await closeAfterFailure();
            controller.error(error);
          }
        },
        cancel: close,
      },
      { highWaterMark: 0 },
    );
  }

  protected async readFileRaw(path_: string): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(await fs.readFile(await this._resolve(path_)));
  }

  protected async mkdirSingle(path_: string): Promise<void> {
    await fs.mkdir(await this._resolve(path_));
  }

  private _existsSync(absolute: string): boolean {
    try {
      statSync(absolute);
      return true;
    } catch {
      return false;
    }
  }

  private _isDirectorySync(absolute: string): boolean {
    try {
      return statSync(absolute).isDirectory();
    } catch {
      return false;
    }
  }

  private async _lstatOrUndefined(absolute: string): Promise<Stats | undefined> {
    try {
      return await fs.lstat(absolute);
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return undefined;
      }
      throw error;
    }
  }

  // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
  private async _readFileOrAbsent(path_: string): Promise<Uint8Array<ArrayBuffer> | null> {
    try {
      return await this.readFile(path_);
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return null;
      }
      throw error;
    }
  }

  /** Sniff the head only; read in full solely to count lines of a text file. */
  private async _contentMetadata(
    absolute: string,
    size: number,
  ): Promise<{ contentKind: 'binary' } | { contentKind: 'text'; lineCount: number }> {
    if (size === 0) {
      return { contentKind: 'text', lineCount: 1 };
    }
    const handle = await fs.open(absolute, 'r');
    try {
      const head = new Uint8Array(Math.min(size, headSniffByteLength));
      const { bytesRead } = await handle.read(head, 0, head.byteLength, 0);
      const sniffed = head.subarray(0, bytesRead);
      if (seemsBinary(sniffed)) {
        return { contentKind: 'binary' };
      }
      const bytes = size <= headSniffByteLength ? sniffed : new Uint8Array(await fs.readFile(absolute));
      return { contentKind: 'text', lineCount: countLineBytes(bytes) };
    } finally {
      await handle.close();
    }
  }

  /** Nearest existing ancestor, so containment can be checked by `realpath`. */
  private async _nearestExistingPath(target: string): Promise<string> {
    let candidate = target;
    for (;;) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Ancestors are walked in order until one exists.
        await fs.lstat(candidate);
        return candidate;
      } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') {
          throw error;
        }
        const parent = path.dirname(candidate);
        if (parent === candidate) {
          throw error;
        }
        candidate = parent;
      }
    }
  }

  /**
   * Whether this directory row resolves somewhere {@link _resolve} will not serve.
   *
   * Any refusal drops the row, not only the laundered-mask one: a broken link
   * answers `ENOENT` and one pointing out of the root `PATH_OUTSIDE_ROOT`, and a
   * row a walker cannot `stat` costs it the whole listing either way (G0b-4).
   */
  private async _refusesLaunderedLink(directory: string, name: string): Promise<boolean> {
    try {
      await this._resolve(joinRooted(directory, name));
      return false;
    } catch {
      return true;
    }
  }

  private async _resolve(rootedPath: string): Promise<string> {
    const canonical = assertRootedPath(rootedPath);
    const target = path.resolve(this._base, canonical);
    if (!isContained(this._base, target)) {
      throw new VirtualPathError('PATH_OUTSIDE_ROOT', rootedPath);
    }
    const [realBase, existing] = await Promise.all([this._realBase, this._nearestExistingPath(target)]);
    const real = await fs.realpath(existing);
    if (!isContained(realBase, real)) {
      throw this._enoent(rootedPath);
    }
    /*
     * A link that stays inside the root but lands on a hidden path launders the
     * mask: every layer above classifies `notes/config`, which no row can see,
     * while the bytes are `.git/config`'s. Both spellings have to answer, and
     * the real one is only knowable here. Free: the `realpath` above is the one
     * the containment check already paid for, and its nearest-existing ancestor
     * decides the whole subtree (PP2).
     *
     * Asymmetric on purpose. Only a *visible* name resolving into a hidden path
     * is refused, so a consumer that reaches the control plane by its own name —
     * the revisions engine over `'working-copy'` — is untouched.
     */
    if (this._policy !== undefined && this._policy.classify(canonical).agentAccess !== 'hidden') {
      const realRelative = path.relative(realBase, real).split(path.sep).join('/');
      if (this._policy.classify(realRelative).agentAccess === 'hidden') {
        throw this._errno('ELOOP', 'refusing to follow a symbolic link into a hidden path', rootedPath);
      }
    }
    return target;
  }

  /** Temp file + fsync + rename, refusing to replace a symlink or a swapped parent. */
  private async _atomicWrite(
    rootedPath: string,
    targetPath: string,
    options: { data: Uint8Array<ArrayBuffer> | string; beforeReplace?: () => Promise<void> },
  ): Promise<void> {
    const { data, beforeReplace } = options;
    const realBase = await this._realBase;
    const admittedDirectory = await fs.realpath(path.dirname(targetPath));
    if (!isContained(realBase, admittedDirectory)) {
      throw new VirtualPathError('PATH_OUTSIDE_ROOT', rootedPath);
    }
    const admittedTarget = path.join(admittedDirectory, path.basename(targetPath));
    const temporaryPath = path.join(
      admittedDirectory,
      `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    const existing = await this._lstatOrUndefined(admittedTarget);
    if (existing?.isSymbolicLink() === true) {
      throw this._errno('ELOOP', 'refusing to replace symbolic link', rootedPath);
    }
    const existingMode = existing === undefined ? undefined : existing.mode % 0o1000;

    let replaced = false;
    let failure: unknown;
    try {
      const handle = await fs.open(temporaryPath, 'wx', existingMode ?? 0o666);
      try {
        await handle.writeFile(bytes);
        if (existingMode !== undefined) {
          await handle.chmod(existingMode);
        }
        await handle.sync();
      } finally {
        await handle.close();
      }

      const currentDirectory = await fs.realpath(path.dirname(targetPath));
      if (currentDirectory !== admittedDirectory || !isContained(realBase, currentDirectory)) {
        throw this._errno('ELOOP', 'refusing to replace a file through a changed parent', rootedPath);
      }
      const currentTarget = await this._lstatOrUndefined(admittedTarget);
      if (currentTarget?.isSymbolicLink() === true) {
        throw this._errno('ELOOP', 'refusing to replace symbolic link', rootedPath);
      }

      await beforeReplace?.();
      await fs.rename(temporaryPath, admittedTarget);
      replaced = true;
      const directoryHandle = await fs.open(admittedDirectory, 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }

      const committed = new Uint8Array(await fs.readFile(admittedTarget));
      if (!bytesEqual(committed, bytes)) {
        throw this._errno('WRITE_VERIFICATION_FAILED', 'committed bytes could not be verified', rootedPath);
      }
    } catch (error) {
      failure = error;
    }
    try {
      await fs.unlink(temporaryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && failure === undefined) {
        failure = error;
      }
    }
    if (failure !== undefined) {
      if (
        replaced &&
        !['CHECKED_WRITE_POTENTIALLY_APPLIED', 'WRITE_VERIFICATION_FAILED'].includes(
          (failure as NodeJS.ErrnoException).code ?? '',
        )
      ) {
        throw Object.assign(new Error('Checked write may have been applied.', { cause: failure }), {
          code: 'CHECKED_WRITE_POTENTIALLY_APPLIED',
        });
      }
      throw failure instanceof Error ? failure : new Error('Filesystem write failed with a non-Error rejection.');
    }
  }

  /** Compare all expected bytes and replace one file inside the module-owned authority integration. */
  readonly #writeFileChecked: AuthorityCheckedWrite = async (input, assertCurrent) => {
    try {
      this._assertRootedPath(input.path);
      // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
      const expectedByPath = new Map<string, Uint8Array<ArrayBuffer> | null>();
      for (const precondition of input.preconditions) {
        this._assertRootedPath(precondition.path);
        const expected =
          precondition.expected === null
            ? null
            : typeof precondition.expected === 'string'
              ? new TextEncoder().encode(precondition.expected)
              : new Uint8Array(precondition.expected);
        const previous = expectedByPath.get(precondition.path);
        if (
          expectedByPath.has(precondition.path) &&
          (previous === null ? expected !== null : expected === null || !bytesEqual(previous!, expected))
        ) {
          throw new TypeError(`Checked write aliases disagree for '${precondition.path}'.`);
        }
        expectedByPath.set(precondition.path, expected);
      }
      if (!expectedByPath.has(input.path)) {
        throw new TypeError('Checked writes require a destination precondition.');
      }
      await assertCurrent();
      const compared = await Promise.all(
        [...expectedByPath].map(async ([candidatePath, expected]) => {
          const actual = await this._readFileOrAbsent(candidatePath);
          if (actual === null ? expected !== null : expected === null || !bytesEqual(actual, expected)) {
            return { path: candidatePath, actual };
          }
          return undefined;
        }),
      );
      const conflicts = compared.filter((conflict) => conflict !== undefined);
      if (conflicts.length > 0) {
        return { status: 'conflict', conflicts };
      }
      const bytes = typeof input.data === 'string' ? new TextEncoder().encode(input.data) : new Uint8Array(input.data);
      const current = await this._readFileOrAbsent(input.path);
      if (current !== null && bytesEqual(current, bytes)) {
        return { status: 'unchanged', content: current };
      }
      const target = await this._resolve(input.path);
      const existingEntry = await this._lstatOrUndefined(target);
      if (existingEntry?.isDirectory() === true) {
        throw this._eisdir(input.path);
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await this._atomicWrite(input.path, target, { data: bytes, beforeReplace: assertCurrent });
      return { status: 'applied', content: bytes };
    } catch (error) {
      if ((error as { applicationState?: unknown }).applicationState !== undefined) {
        throw error;
      }
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
        applicationState: ['CHECKED_WRITE_POTENTIALLY_APPLIED', 'WRITE_VERIFICATION_FAILED'].includes(
          (error as NodeJS.ErrnoException | undefined)?.code ?? '',
        )
          ? 'potentially-applied'
          : 'known-not-applied',
      });
    }
  };
}

/** Execute checked replacement through the package-private Node authority integration. @internal */
export const writeNodeFileCheckedWithAuthority = async (
  provider: NodeFsProvider,
  input: Omit<CheckedFileWrite, 'signal'>,
  writer: NodeAuthorityWriter,
): Promise<CheckedFileWriteResult> => {
  const writeChecked = authorityCheckedWrites.get(provider);
  if (writeChecked === undefined) {
    throw Object.assign(new Error('Node filesystem provider has no checked-write implementation.'), {
      code: 'CHECKED_WRITE_UNSUPPORTED',
      applicationState: 'known-not-applied',
    });
  }
  return writeChecked(input, async () => writer.assertCurrent());
};
