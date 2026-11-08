/**
 * Import source adapters and the plan they produce (charter D12).
 *
 * Every source — a zip `Blob` read by range from its central directory, a
 * folder's `File`s, a picked directory handle walked in the worker, a
 * downloaded archive spooled from a stream of declared size — lists entries
 * as names, sizes and the `Blob` range that holds each one. No source reads
 * file content to list it. {@link planImport} runs the path policy and the
 * limits over that listing, so the whole import is judged before a byte is
 * decoded, and what it returns is all a review screen needs: paths and sizes.
 *
 * @module
 */

import type { FileMode, PathPolicy } from '#types.js';
import { ImportMeter, ImportRefusedError, importLimits } from '#importer/limits.js';
import type { ImportLimits } from '#importer/limits.js';
import { ImportPathAdmission, normalizeImportPath, sharedLeadingFolders } from '#importer/path-policy.js';
import { blobRangeSource, readZipDirectory } from '#importer/zip.js';
import type { ImportDecodeRequest } from '#importer/decode.js';

/**
 * What identifies a source well enough to tell, on resume, that it is the
 * same one: never its bytes.
 *
 * @public
 */
export type ImportSourcePin = Readonly<{
  /** `linked`: a repository fetched as objects, whose worktree is the fetched revision's tree. */
  kind: 'zip' | 'files' | 'directory' | 'archive' | 'linked';
  name: string;
  /** Total bytes the source holds (the archive, or the files' sum). */
  size: number;
  /** Entries the source listed. */
  entries: number;
  /** Latest modification time among the source's files, when it has one. */
  lastModified?: number;
  /** An exact upstream revision (a commit) the source was fetched at, when it has one. */
  revision?: string;
  /** What the source's own bytes say it is, when it can say cheaply: a zip's central-directory identity. */
  identity?: string;
  /** The folder inside the source that became the project root, when one was chosen. */
  root?: string;
}>;

/**
 * Where a host-side source's file is (W7.4): the opaque grant the host minted
 * when a person chose the source, and the file's path inside it. The host
 * resolves both; neither is a host path (I6).
 *
 * @public
 */
export type HostImportLocator = Readonly<{ grant: string; from: string }>;

/**
 * One entry as a source lists it, before the path policy: bytes the decoder
 * reads, or a file the host copies itself.
 *
 * @public
 */
export type ImportListedEntry = Readonly<{
  /** The path as the source spells it. */
  source: string;
  size: number;
  mode?: FileMode;
  /** Its stored size, inside an archive. */
  compressedSize?: number;
  /** When the source's file was last modified, where the listing says (a host row). */
  lastModified?: number;
}> &
  (
    | Readonly<{
        /** What the decoder reads, less the path. */
        request: Omit<ImportDecodeRequest, 'path' | 'size'>;
        host?: undefined;
      }>
    | Readonly<{ request?: undefined; host: HostImportLocator }>
  );

/**
 * What a source's listing is given: when a directory's subtree is left
 * behind, the count of each entry as it is found, the source's own identity
 * for its pin, and a signal.
 *
 * @public
 */
export type ImportListControl = Readonly<{
  prunes: (path: string) => boolean;
  listed: (path: string) => void;
  identify?: (identity: string) => void;
  signal?: AbortSignal;
}>;

/**
 * A source: a name, a pin, and its entries.
 *
 * @public
 */
export type ImportSource = Readonly<{
  kind: ImportSourcePin['kind'];
  /** A name for the project: the archive or folder's, less any `.zip`. */
  name: string;
  /** The archive's own size, when the source is one. */
  archiveBytes?: number;
  /** Revision the source was fetched at. */
  revision?: string;
  /** Whether leading folders every path shares are dropped (a dragged folder, a zip of one). */
  stripSharedFolders: boolean;
  /**
   * List every entry. `prunes` says when a directory's subtree is left
   * behind, so a walk can skip it; `listed` counts each entry against the
   * limits as it is found.
   */
  list: (control: ImportListControl) => AsyncIterable<ImportListedEntry>;
}>;

/**
 * One entry an import keeps.
 *
 * @public
 */
export type PlannedImportEntry = Readonly<{
  path: string;
  size: number;
  mode?: FileMode;
}> &
  (
    | Readonly<{ request: ImportDecodeRequest; host?: undefined }>
    /** A file the host copies into the staging itself, never decoded here (W7.4). */
    | Readonly<{ request?: undefined; host: HostImportLocator }>
  );

/**
 * A source judged: what will be imported, and what was left behind.
 *
 * @public
 */
export type ImportPlan = Readonly<{
  name: string;
  pin: ImportSourcePin;
  entries: readonly PlannedImportEntry[];
  /** Bytes the kept entries declare. */
  bytes: number;
  skipped: Readonly<{ excluded: number; reserved: number; symlinks: number }>;
}>;

const withoutZipExtension = (name: string): string => name.replace(/\.zip$/iu, '');

/* Resource forks a macOS archiver adds beside every entry: metadata of the archive, not content of the project. */
const isArchiverMetadata = (path: string): boolean => path === '__MACOSX' || path.startsWith('__MACOSX/');

/**
 * A zip `Blob`, read by range from its central directory.
 *
 * @param blob - The archive (a dropped `File`, or a spooled download).
 * @param options - The name to import it under (the file's, by default) and the revision it was fetched at.
 * @returns The source.
 * @public
 */
export const zipImportSource = (
  blob: Blob,
  options: Readonly<{ name?: string; kind?: 'zip' | 'archive'; revision?: string; limits?: ImportLimits }> = {},
): ImportSource => ({
  kind: options.kind ?? 'zip',
  name: withoutZipExtension(options.name ?? (blob instanceof File ? blob.name : 'Archive')),
  archiveBytes: blob.size,
  ...(options.revision === undefined ? {} : { revision: options.revision }),
  stripSharedFolders: true,
  async *list(control) {
    const limits = options.limits ?? importLimits;
    const { entries, identity } = await readZipDirectory(blobRangeSource(blob), {
      maximumEntries: limits.maximumEntries,
      /* A raw name still carries the folder the plan strips, so the directory allows it twice the path limit. */
      maximumPathBytes: 2 * limits.maximumPathBytes,
    });
    control.identify?.(identity);
    for (const entry of entries) {
      control.signal?.throwIfAborted();
      if (entry.directory) {
        continue;
      }
      control.listed(entry.name);
      if (entry.symlink) {
        yield { source: entry.name, size: -1, request: { blob } };
        continue;
      }
      yield {
        source: entry.name,
        size: entry.size,
        compressedSize: entry.compressedSize,
        ...(entry.mode === undefined ? {} : { mode: entry.mode }),
        request: {
          blob,
          zip: {
            localHeaderOffset: entry.localHeaderOffset,
            extentEnd: entry.extentEnd,
            compressedSize: entry.compressedSize,
            method: entry.method,
            crc32: entry.crc32,
          },
        },
      };
    }
  },
});

/**
 * Files already in hand as `File`s, each with its path: an `<input>` folder
 * pick (`webkitRelativePath`), several files, or a tree a drop listed.
 *
 * @param files - The files and their source paths.
 * @param options - The name to import them under.
 * @returns The source.
 * @public
 */
export const fileListImportSource = (
  files: ReadonlyArray<Readonly<{ file: Blob; path: string }>>,
  options: Readonly<{ name?: string }> = {},
): ImportSource => ({
  kind: 'files',
  name: options.name ?? '',
  stripSharedFolders: true,
  async *list(control) {
    const pruned = prunedFolders(control);
    for (const { file, path } of files) {
      control.signal?.throwIfAborted();
      /* A picked or dropped folder arrives flat: what sits under a left-behind folder is never counted. */
      if (pruned(path)) {
        continue;
      }
      control.listed(path);
      yield { source: path, size: file.size, request: { blob: file } };
    }
  },
});

/* Whether a flat path sits under a folder the walk leaves behind, each folder asked once. */
const prunedFolders = (control: ImportListControl): ((path: string) => boolean) => {
  const known = new Map<string, boolean>();
  return (path) => {
    const segments = normalizeImportPath(path).split('/');
    for (let depth = 1; depth < segments.length; depth += 1) {
      const folder = segments.slice(0, depth).join('/');
      let prunes = known.get(folder);
      if (prunes === undefined) {
        prunes = control.prunes(folder);
        known.set(folder, prunes);
      }
      if (prunes) {
        return true;
      }
    }
    return false;
  };
};

/** The two members of a directory handle a walk uses, typed apart from DOM lib differences. */
type WalkableDirectory = Readonly<{
  name: string;
  values: () => AsyncIterable<
    | Readonly<{ kind: 'file'; name: string; getFile: () => Promise<File> }>
    | (WalkableDirectory & Readonly<{ kind: 'directory' }>)
  >;
}>;

/* One folder walked depth first, never entering a subtree the policy leaves behind. */
const walkDirectory = async function* (
  directory: WalkableDirectory,
  prefix: string,
  control: ImportListControl,
): AsyncGenerator<ImportListedEntry> {
  for await (const child of directory.values()) {
    control.signal?.throwIfAborted();
    const path = prefix === '' ? child.name : `${prefix}/${child.name}`;
    if (child.kind === 'directory') {
      if (!control.prunes(path)) {
        yield* walkDirectory(child, path, control);
      }
      continue;
    }
    control.listed(path);
    const file = await child.getFile();
    yield { source: path, size: file.size, request: { blob: file } };
  }
};

/**
 * A picked folder, walked where the import runs (a handle crosses to a worker
 * by reference). A subtree the policy leaves behind (`.git`, `node_modules`)
 * is never entered.
 *
 * @param handle - The folder.
 * @returns The source.
 * @public
 */
export const directoryHandleImportSource = (handle: FileSystemDirectoryHandle): ImportSource => {
  const root = handle as unknown as WalkableDirectory;
  return {
    kind: 'directory',
    name: root.name,
    stripSharedFolders: true,
    list: (control) => walkDirectory(root, '', control),
  };
};

/**
 * What a drop carries as handles (`DataTransferItem.getAsFileSystemHandle`):
 * files and folders side by side, each folder walked under its own name where
 * the import runs, so the page never walks the drop.
 *
 * @param handles - The dropped files and folders.
 * @returns The source.
 * @public
 */
export const handleListImportSource = (handles: readonly FileSystemHandle[]): ImportSource => ({
  kind: 'files',
  name: '',
  stripSharedFolders: true,
  async *list(control) {
    for (const handle of handles as unknown as ReadonlyArray<
      | Readonly<{ kind: 'file'; name: string; getFile: () => Promise<File> }>
      | (WalkableDirectory & Readonly<{ kind: 'directory' }>)
    >) {
      control.signal?.throwIfAborted();
      if (handle.kind === 'directory') {
        if (!control.prunes(handle.name)) {
          yield* walkDirectory(handle, handle.name, control);
        }
        continue;
      }
      control.listed(handle.name);
      // oxlint-disable-next-line no-await-in-loop -- a drop's handles are listed in order.
      const file = await handle.getFile();
      yield { source: handle.name, size: file.size, request: { blob: file } };
    }
  },
});

/**
 * One row of a host-side source's directory, as its host lists it: a link or
 * special file named as such, never followed.
 *
 * @public
 */
export type HostImportRow = Readonly<{
  name: string;
  kind: 'file' | 'dir' | 'symlink' | 'other';
  size: number;
  mtimeMs: number;
}>;

/**
 * What a host-side source answers: one directory's rows, and a preview of one
 * file, by grant and path inside it (W7.4). On desktop the node host answers
 * over its wire; the source's bytes never come here to be imported.
 *
 * @public
 */
export type HostImportSourcePort = Readonly<{
  /** One bounded page of a directory, from `offset`, and whether more rows follow. */
  list: (
    grant: string,
    path: string,
    offset?: number,
  ) => Promise<Readonly<{ rows: readonly HostImportRow[]; more: boolean }>>;
  read: (grant: string, path: string, maximumBytes: number) => Promise<Uint8Array<ArrayBuffer>>;
}>;

/**
 * A source a person chose on the host, as the grants the host minted: one
 * folder, or files side by side (W7.4).
 *
 * @public
 */
export type HostImportGrant = Readonly<{ grant: string; name: string; kind: 'directory' | 'file' }>;

/* One granted folder walked as `walkDirectory` walks a handle: depth first, never entering a pruned subtree. */
const walkHostDirectory = async function* (
  walk: Readonly<{ port: HostImportSourcePort; grant: string; control: ImportListControl }>,
  directory: string,
  prefix: string,
): AsyncGenerator<ImportListedEntry> {
  const { port, grant, control } = walk;
  /* A page at a time, so a directory of any size is never held whole: the entry limit stops it as it goes. */
  for (let offset = 0, more = true; more; ) {
    control.signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- a directory is read one page after another.
    const page = await port.list(grant, directory, offset);
    offset += page.rows.length;
    more = page.more && page.rows.length > 0;
    yield* hostRows(walk, page.rows, { directory, prefix });
  }
};

/* One page of a granted directory's rows, each counted against the entry limit as it is found. */
const hostRows = async function* (
  walk: Readonly<{ port: HostImportSourcePort; grant: string; control: ImportListControl }>,
  rows: readonly HostImportRow[],
  at: Readonly<{ directory: string; prefix: string }>,
): AsyncGenerator<ImportListedEntry> {
  const { grant, control } = walk;
  const { directory, prefix } = at;
  for (const row of rows) {
    control.signal?.throwIfAborted();
    const from = directory === '' ? row.name : `${directory}/${row.name}`;
    const path = prefix === '' ? row.name : `${prefix}/${row.name}`;
    if (row.kind === 'dir') {
      if (!control.prunes(path)) {
        yield* walkHostDirectory(walk, from, path);
      }
      continue;
    }
    control.listed(path);
    /* A special file (a socket, a device) is not content: counted, then left, as a picked folder never offers one. */
    if (row.kind === 'other') {
      continue;
    }
    /* A link is counted as skipped, as an archive's is: it is never followed out of the source. */
    yield row.kind === 'symlink'
      ? { source: path, size: -1, host: { grant, from } }
      : { source: path, size: row.size, lastModified: row.mtimeMs, host: { grant, from } };
  }
};

/**
 * A source a person chose on the host (W7.4): a folder, walked by its host
 * a directory at a time with the path policy pruning as it goes, or files the
 * operating system opened with Tau. Its entries are copied into the staging
 * by the host, never read here: on desktop a folder import costs one copy (a
 * clone where the file system can) instead of three crossings of every byte.
 *
 * @param port - The host that minted the grants.
 * @param grants - One folder, or several files.
 * @param options - The name to import under.
 * @returns The source.
 * @public
 */
export const hostImportSource = (
  port: HostImportSourcePort,
  grants: readonly HostImportGrant[],
  options: Readonly<{ name?: string }> = {},
): ImportSource => {
  const [only] = grants;
  const folder = grants.length === 1 && only?.kind === 'directory' ? only : undefined;
  return {
    kind: folder === undefined ? 'files' : 'directory',
    name: options.name ?? folder?.name ?? '',
    stripSharedFolders: true,
    async *list(control) {
      for (const grant of grants) {
        control.signal?.throwIfAborted();
        if (grant.kind === 'directory') {
          /* A lone folder is the project root, as a picked handle is; beside others, it is walked under its name. */
          const prefix = folder === undefined ? grant.name : '';
          if (prefix === '' || !control.prunes(prefix)) {
            yield* walkHostDirectory({ port, grant: grant.grant, control }, '', prefix);
          }
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- a source's grants are listed in order.
        const listed = await port.list(grant.grant, '');
        const [row] = listed.rows;
        if (row === undefined) {
          continue;
        }
        control.listed(grant.name);
        if (row.kind === 'other') {
          continue;
        }
        yield row.kind === 'file'
          ? {
              source: grant.name,
              size: row.size,
              lastModified: row.mtimeMs,
              host: { grant: grant.grant, from: row.name },
            }
          : { source: grant.name, size: -1, host: { grant: grant.grant, from: row.name } };
      }
    },
  };
};

/**
 * Spool a downloaded archive of declared size into a `Blob`, refusing it as
 * soon as either the declaration or the bytes pass the archive limit. The
 * browser keeps a large `Blob` out of the page's heap, so a zip that cannot be
 * read by range off the network is read by range from here.
 *
 * @param stream - The response body.
 * @param options - The size the server declared, the limits, a signal and a progress callback.
 * @returns The archive.
 * @throws ImportRefusedError `archiveTooLarge` as soon as either size passes the limit.
 * @public
 */
export const spoolImportArchive = async (
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  options: Readonly<{
    declaredSize?: number;
    limits?: ImportLimits;
    signal?: AbortSignal;
    onProgress?: (received: number) => void;
  }> = {},
): Promise<Blob> => {
  const meter = new ImportMeter(options.limits);
  const reader = stream.getReader();
  try {
    if (options.declaredSize !== undefined) {
      meter.archive(options.declaredSize);
    }
    /* Chunks fold into a part every few megabytes, so the page holds a few
     * chunks and the browser holds the rest. */
    const parts: Blob[] = [];
    let pending: Array<Uint8Array<ArrayBuffer>> = [];
    let pendingBytes = 0;
    let received = 0;
    // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another.
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      options.signal?.throwIfAborted();
      received += read.value.byteLength;
      meter.archive(received);
      pending.push(read.value);
      pendingBytes += read.value.byteLength;
      if (pendingBytes >= 8 * 1024 * 1024) {
        parts.push(new Blob(pending));
        pending = [];
        pendingBytes = 0;
      }
      options.onProgress?.(received);
    }
    parts.push(new Blob(pending));
    if (options.declaredSize !== undefined && options.declaredSize > 0 && received !== options.declaredSize) {
      throw new ImportRefusedError('corrupt', { message: 'The download ended before the whole archive arrived.' });
    }
    return new Blob(parts, { type: 'application/zip' });
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
};

/**
 * Judge a source: list it once, then run the path policy and the limits over
 * every entry. Nothing is decoded.
 *
 * @param source - The zip, file list or directory to import.
 * @param options - The path policy, the limits, and a signal.
 * @returns The kept entries, their total size and what was skipped.
 * @throws ImportRefusedError when the source breaks a limit or carries an unsafe or colliding path.
 * @public
 */
export const planImport = async (
  source: ImportSource,
  options: Readonly<{
    policy: PathPolicy;
    limits?: ImportLimits;
    signal?: AbortSignal;
    /**
     * A folder inside the source, relative to its one shared top folder
     * when it has one (a repository archive's `<repo>-<sha>/`): only what is
     * under it is imported, and it becomes the project root. `.` or an empty
     * root is the whole source.
     */
    root?: string;
  }>,
): Promise<ImportPlan> => {
  const limits = options.limits ?? importLimits;
  const meter = new ImportMeter(limits);
  if (source.archiveBytes !== undefined) {
    meter.archive(source.archiveBytes);
  }
  const walkAdmission = new ImportPathAdmission(options.policy, new ImportMeter(limits));
  let listedCount = 0;
  const listed: ImportListedEntry[] = [];
  let symlinks = 0;
  let identity: string | undefined;
  for await (const entry of source.list({
    identify: (value) => {
      identity = value;
    },
    prunes: (path) => walkAdmission.prunes(normalizeImportPath(path)),
    listed: (path) => {
      listedCount += 1;
      if (listedCount > limits.maximumEntries) {
        throw new ImportRefusedError('tooManyEntries', { limits, path });
      }
    },
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })) {
    const normalized = normalizeImportPath(entry.source);
    if (entry.size < 0) {
      symlinks += 1;
      continue;
    }
    if (isArchiverMetadata(normalized)) {
      continue;
    }
    listed.push({ ...entry, source: normalized });
  }
  let strip = source.stripSharedFolders ? sharedLeadingFolders(listed.map(({ source: path }) => path)) : 0;
  /* A shared folder the policy leaves behind (`.git` alone) is never stripped into content. */
  const sharedFolders = listed[0]?.source.split('/') ?? [];
  for (let depth = 1; depth <= strip; depth += 1) {
    if (walkAdmission.prunes(sharedFolders.slice(0, depth).join('/'))) {
      strip = depth - 1;
      break;
    }
  }
  /* `.`, `./` and `` name the whole content root. */
  const rootPath = options.root === undefined ? '' : normalizeImportPath(options.root);
  const root = rootPath === '' ? [] : rootPath.split('/');
  if (root.length > 0) {
    /*
     * A root is relative to the archive's one top folder (`<repo>-<sha>/`),
     * never to however many folders happen to be shared: with `a/a/x` and
     * `a/y` under the top folder, root `a` is `a/`, not `a/a/`.
     */
    strip = Math.min(strip, 1);
  }
  const underRoot = (path: string): boolean => {
    const segments = path.split('/');
    return segments.length > strip + root.length && root.every((segment, index) => segments[strip + index] === segment);
  };
  const admission = new ImportPathAdmission(options.policy, meter, { stripSegments: strip + root.length });
  const entries: PlannedImportEntry[] = [];
  let excluded = 0;
  let reserved = 0;
  let lastModified = 0;
  for (const entry of listed) {
    /* What lies outside the root is not the project's: never admitted, never counted against it. */
    if (!underRoot(entry.source)) {
      continue;
    }
    const verdict = admission.admit(entry.source);
    if (verdict.kind === 'skip') {
      if (verdict.why === 'excluded') {
        excluded += 1;
      } else {
        reserved += 1;
      }
      continue;
    }
    meter.declared(verdict.path, entry.size, entry.compressedSize);
    const modified =
      entry.lastModified ??
      (entry.request?.blob instanceof File && entry.request.zip === undefined
        ? entry.request.blob.lastModified
        : undefined);
    if (modified !== undefined) {
      lastModified = Math.max(lastModified, modified);
    }
    const kept = { path: verdict.path, size: entry.size, ...(entry.mode === undefined ? {} : { mode: entry.mode }) };
    entries.push(
      entry.host === undefined
        ? { ...kept, request: { ...entry.request, path: verdict.path, size: entry.size } }
        : { ...kept, host: entry.host },
    );
  }
  if (entries.length === 0) {
    throw new ImportRefusedError('empty', { limits });
  }
  const strippedName = strip > 0 && source.kind === 'files' ? (listed[0]?.source.split('/')[strip - 1] ?? '') : '';
  const name = source.name === '' ? strippedName || fallbackName(entries) : source.name;
  return {
    name,
    pin: {
      kind: source.kind,
      name,
      size: source.archiveBytes ?? meter.declaredBytes,
      entries: listedCount,
      ...(lastModified === 0 ? {} : { lastModified }),
      ...(source.revision === undefined ? {} : { revision: source.revision }),
      ...(identity === undefined ? {} : { identity }),
      ...(root.length === 0 ? {} : { root: root.join('/') }),
    },
    entries,
    bytes: meter.declaredBytes,
    skipped: { excluded, reserved, symlinks },
  };
};

/* One file is named for itself, less its extension; several with no shared folder are "Uploaded Files". */
const fallbackName = (entries: readonly PlannedImportEntry[]): string => {
  if (entries.length === 1) {
    return (entries[0]?.path.split('/').pop() ?? 'Untitled').replace(/\.[^.]+$/u, '');
  }
  return 'Uploaded Files';
};
