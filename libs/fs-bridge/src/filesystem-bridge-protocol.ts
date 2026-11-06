import type {
  AppendFence,
  ChangeSet,
  Changeset,
  ChangesetEntry,
  ChangesetReceipt,
  ChangeSetWatchRequest,
  ProviderCapabilities,
  FileSystemProvider,
  FileTreeNode,
  ProjectDiscoveryEntry,
  ProjectLocator,
  ProjectRootConfig,
  ProjectRootDiscoveryStatus,
  RootedFileSystem,
  RootedPorcelain,
  MountConfig,
  StorageRootConfig,
  WatchEvent,
  WatchRequest,
  WorkspaceFileService,
  WorkspaceMutationError,
  WorkspaceScope,
} from '@taucad/filesystem';
import { maximumChangesetEntries, pendingProjectCommitInputSchema } from '@taucad/filesystem';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import type { ContentExportFilter } from '@taucad/filesystem/content-ops';
import type {
  ChangeEvent,
  CheckedFileWrite,
  CheckedFileWriteResult,
  FileWritePrecondition,
  FileProvenance,
  FileStat,
  FileStatEntry,
  ProjectManifestParseIssue,
  MachineSettingsRecord,
  MachineSettingsSnapshot,
  MachineSettingsEdit,
  MachineSettingsSave,
  MachineSettingsService,
  MachineSettingsValue,
} from '@taucad/types';
import { projectIdSchema, projectManifestSchema, projectManifestSchemaUrl } from '@taucad/types';
import { filesystemBackends } from '@taucad/types/constants';
import type { BridgeLongCall, BridgeProgress, BridgeProtocolSchemas } from '@taucad/rpc/bridge';
import type { WireValidator } from '@taucad/rpc';
import { assertRootedPath } from '@taucad/utils/path';
import type { ComputeRestartedEvent } from '#filesystem-bridge-compute-events.js';
import { z } from 'zod';
import { cloneBoundedJson } from '@taucad/parameters/json';

/**
 * Keep exact result branches while emitting a Zod 4.0-compatible union type.
 * @param discriminator - The wire discriminator.
 * @param branches - The validated result variants.
 * @returns The discriminated parser under the stable union type.
 */
const discriminatedResultUnion = <
  const Branches extends readonly [z.core.$ZodTypeDiscriminable, ...z.core.$ZodTypeDiscriminable[]],
>(
  discriminator: string,
  branches: Branches,
): z.ZodUnion<Branches> => z.discriminatedUnion(discriminator, branches);

/**
 * Current filesystem bridge protocol version.
 *
 * Version 7 makes every stat metadata only: content facts ride along only when
 * already known (I3), and the head mode is gone. Version 8 delivers one
 * `fileChanged` message per changeset per port: the fact itself, or every
 * fact of the changeset as a `changeSet` envelope (charter D6). Version 9 is
 * wire v3's first slice (charter D14, W10): `readMany` and `readRange`, and
 * long calls — size-dependent calls that live while the authority heartbeats
 * instead of dying at 30 s, carry the caller's abort and report progress. No
 * shim for 8 (D20). The same version carries the second slice: `apply` (one
 * changeset over the wire), `glob`, `grep` and `indexStats` — calls a v9 peer
 * either serves or refuses, so the slices share one bump (D20).
 * @public
 */
export const fileSystemBridgeProtocolVersion = 9;

/**
 * Caller-side controls of a long bridge call (charter D14): an `AbortSignal`
 * that cancels it on the authority, and a progress observer.
 *
 * @public
 */
export type LongCall = BridgeLongCall;

/**
 * One progress report of a long bridge call: `done` of `total` units (files),
 * `bytes` of `totalBytes` content bytes.
 *
 * @public
 */
export type LongCallProgress = BridgeProgress;

/**
 * Most paths one `readMany` names, so one reply stays one bounded batch; a
 * larger set is a sequence of calls.
 *
 * @public
 */
export const maxReadManyPaths = 4096;

/**
 * Most bytes one `readRange` returns: a page, not a whole large file. A larger
 * read is a sequence of ranges.
 *
 * @public
 */
export const maxReadRangeBytes = 64 * 1024 * 1024;

/**
 * What `readMany` answers for each path: its bytes, or `'missing'` when nothing
 * is there (the runtime's own word for absence, as in `hashFiles`).
 *
 * @public
 */
export type ReadManyResult = ReadonlyMap<string, Uint8Array<ArrayBuffer> | 'missing'>;

/**
 * `readMany`'s wire form: `[path, bytes | 'missing']` rows in request order. A
 * map does not survive every transport the bridge rides; rows do.
 */
export type ReadManyWireRows = Array<[string, Uint8Array<ArrayBuffer> | 'missing']>;

/**
 * One changeset entry as the wire carries it: a write's bytes are in hand or a
 * `Blob`. A caller's `ReadableStream` is staged into a `Blob` on the caller's
 * side before the call, because a stream does not cross every transport the
 * bridge rides (the pipeline stages streams before locking anyway, I11).
 *
 * @public
 */
export type FileSystemBridgeChangesetEntry =
  | Exclude<ChangesetEntry, { readonly op: 'write' }>
  | (Omit<Extract<ChangesetEntry, { readonly op: 'write' }>, 'data'> & {
      readonly data: Uint8Array<ArrayBuffer> | Blob | string;
    });

/**
 * A changeset as the wire carries it. Its `AbortSignal` rides the long call,
 * not the arguments.
 *
 * @public
 */
export type FileSystemBridgeChangeset = Readonly<{
  entries: readonly FileSystemBridgeChangesetEntry[];
  lifecycle?: boolean;
}>;

/**
 * Caller-side controls of `apply`: its abort, and who owns the bytes. An
 * apply reports no progress: it lives on the authority's heartbeats.
 *
 * - `'copy'` (the default): every in-hand buffer is copied before it crosses,
 *   so the caller's arrays stay usable.
 * - `'owned'`: the caller hands its buffers over; a buffer an entry fills
 *   whole is transferred, never copied, and is detached on return (I2). A view
 *   over part of a larger buffer is still copied, so the rest of that buffer
 *   is neither sent nor detached.
 *
 * @public
 */
export type ApplyOptions = { readonly signal?: AbortSignal; readonly transfer?: 'copy' | 'owned' };

/**
 * Caller-owned shape of a `glob`: where to start and how many rows. It matches
 * the index's file rows; the index holds no directory rows. The view's mask is
 * inherited, never re-declared.
 *
 * @public
 */
export type GlobOptions = {
  /** Root-relative directory to match under; the whole root when absent. */
  readonly path?: string;
  readonly maxResults?: number;
};

/**
 * Caller-owned shape of a `grep`.
 *
 * @public
 */
export type GrepOptions = {
  /** Root-relative directory to search under; the whole root when absent. */
  readonly path?: string;
  /** Only files whose root-relative path matches this glob. */
  readonly glob?: string;
  /** Match case exactly; default `false`. */
  readonly caseSensitive?: boolean;
  /** Treat the pattern as literal text, not a regular expression. */
  readonly fixedStrings?: boolean;
  /** Most matches returned; default {@link defaultGrepResults}, at most {@link maxGrepResults}. */
  readonly maxResults?: number;
  /** Skip files larger than this many bytes; default {@link defaultGrepFileBytes}. */
  readonly maxFileBytes?: number;
  /** Lines of context on each side of a match, at most {@link maxGrepContext}. */
  readonly context?: number;
};

/**
 * One line a `grep` matched. `line` and `column` count from 1; `text` and the
 * context lines are cut at {@link maxGrepLineCharacters}.
 *
 * @public
 */
export type GrepMatch = {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;
  readonly before?: readonly string[];
  readonly after?: readonly string[];
};

/**
 * What a `grep` found, in the index's file order and line order.
 *
 * `filesSkipped` counts candidates not searched: binary, over `maxFileBytes`,
 * or gone between the index and the read. `truncated` says `maxResults` cut
 * the matches short.
 *
 * @public
 */
export type GrepResult = {
  readonly matches: readonly GrepMatch[];
  readonly filesSearched: number;
  readonly filesSkipped: number;
  readonly truncated: boolean;
};

/**
 * Totals of one subtree's files, from the root's index (charter D3): no file
 * is read. Content facts are counted only where the index already knows them
 * (I3): `textFiles + binaryFiles` can be less than `files`, and `lines` sums
 * the line counts already measured.
 *
 * @public
 */
export type IndexStats = {
  readonly files: number;
  readonly bytes: number;
  readonly textFiles: number;
  readonly binaryFiles: number;
  readonly lines: number;
};

/** Matches a `grep` returns when the caller names no cap. @public */
export const defaultGrepResults = 250;
/** Most matches one `grep` returns. @public */
export const maxGrepResults = 5000;
/** Largest file a `grep` reads when the caller names no cap. @public */
export const defaultGrepFileBytes = 4 * 1024 * 1024;
/** Most context lines on each side of a `grep` match. @public */
export const maxGrepContext = 10;
/** Characters of a matched or context line a `grep` returns. @public */
export const maxGrepLineCharacters = 500;

const unavailableCapabilities = null;

/** Typed error for incompatible filesystem bridge peers. @public */
export class FileSystemBridgeProtocolVersionError extends Error {
  public readonly expected = fileSystemBridgeProtocolVersion;
  public readonly received: unknown;

  public constructor(received: unknown) {
    super(
      `Filesystem bridge protocol version mismatch: expected ${fileSystemBridgeProtocolVersion}, received ${String(received)}.`,
    );
    this.name = 'FileSystemBridgeProtocolVersionError';
    this.received = received;
  }

  public get code(): 'FILESYSTEM_BRIDGE_PROTOCOL_VERSION_MISMATCH' {
    return 'FILESYSTEM_BRIDGE_PROTOCOL_VERSION_MISMATCH';
  }
}

/** Immutable metadata sent by every filesystem bridge server. @public */
export type FileSystemBridgeHello =
  | {
      readonly v: typeof fileSystemBridgeProtocolVersion;
      readonly state: 'ready';
      readonly capabilities: ProviderCapabilities;
      readonly watchable: boolean;
      /**
       * Whether the host answers `hashFiles`. Absent from a host that predates
       * the call, so a client falls back to reading bodies (capability presence,
       * not a protocol bump, decides).
       */
      readonly hashable?: boolean;
    }
  | {
      readonly v: typeof fileSystemBridgeProtocolVersion;
      readonly state: 'workspace';
      readonly capabilities: typeof unavailableCapabilities;
      readonly watchable: boolean;
    }
  | {
      readonly v: typeof fileSystemBridgeProtocolVersion;
      readonly state: 'unavailable';
      readonly capabilities: typeof unavailableCapabilities;
      readonly watchable: false;
      readonly error: {
        readonly code: 'ROOT_UNAVAILABLE';
        readonly message: string;
      };
    };

/**
 * What an unrooted (workspace) connection may name: **topology only**.
 *
 * Charter deviation H3 is closed here (W11, EQ3). The wire used to carry 21
 * per-path content calls beside these nine, and the authority-global surface
 * walks the raw provider — so every one of them was an unmasked read or write of
 * a project tree, which is exactly what the reserved layout refuses everywhere
 * else (authority Rule 16). Content is now the rooted surface's without
 * exception: the members still exist on {@link WorkspaceFileService} as
 * in-process members, because the mutation pipeline and the rooted views call
 * them, and only the *wire* lost them.
 */
type WorkspaceBridgeMethodName =
  | 'mount'
  | 'unmount'
  | 'configureProjectRoots'
  | 'listProjectManifests'
  | 'commitPendingProjectDirectory'
  | 'adoptProjectDirectory'
  | 'permanentlyDeleteProjectDirectory'
  | 'disposeStorageRoot'
  | 'pollExternalChanges';

/**
 * The `/files` browser's physical-scope reads, under their own wire names
 * (charter D5, W11).
 *
 * Every path here names a {@link WorkspaceScope} the mount table does not route
 * — a folder the person granted that no project claims — so no composed view
 * exists to serve it and the authority reads it through a standalone provider.
 * The names are the authority's own read members plus `Scoped`, because `scope`
 * is **required** and a member called `readFile` on this surface would invite
 * precisely the routed-path read W11 removed: a routed path is content, and
 * content belongs to the root that owns it (D5, D12).
 *
 * @public
 */
export type FileSystemBridgeScopedReads = {
  readScopedFile(path: string, options: { readonly encoding: 'utf8'; readonly scope: WorkspaceScope }): Promise<string>;
  readScopedFile(path: string, options: { readonly scope: WorkspaceScope }): Promise<Uint8Array<ArrayBuffer>>;
  readScopedShallowDirectory(path: string, options: { readonly scope: WorkspaceScope }): Promise<FileTreeNode[]>;
  getScopedZippedDirectory(path: string, options: { readonly scope: WorkspaceScope }): Promise<Blob>;
};

/** Workspace-wide bridge calls, with signatures derived from the authority service. @public */
export type FileSystemBridgeWorkspaceService = Pick<WorkspaceFileService, WorkspaceBridgeMethodName> &
  FileSystemBridgeScopedReads;

/** Rooted/runtime bridge calls, including watch registration that may cross an asynchronous authority boundary. @public */
export type FileSystemBridgeRuntimeService = FileSystemProvider &
  Partial<MachineSettingsService> & {
    watch?: (request: WatchRequest, handler: (event: WatchEvent) => void) => (() => void) | Promise<() => void>;
    /*
     * Read content operations are the composition site's to serve (charter D2):
     * a host that hands over a bare provider has no composed view to inherit a
     * mask from, so it offers neither.
     */
    archive?: (path: string, options?: ArchiveOptions) => Promise<Blob>;
    contents?: (path: string, options?: ArchiveOptions) => Promise<Record<string, Uint8Array<ArrayBuffer>>>;
    /*
     * Search and recursive stat are the root's index, masked by the view above it
     * (charter D3): a bare provider has no index and offers neither.
     */
    search?: (query: string, options?: SearchOptions) => Promise<FileStatEntry[]>;
    statTree?: (path: string) => Promise<FileStatEntry[]>;
    /*
     * A host whose provider can digest without buffering supplies its own; the
     * bridge otherwise derives one from `readFile` on the host's side of the wire.
     */
    hashFiles?: FileSystemBridgeHashFiles;
    /*
     * Wire v3 reads (charter D14). A host whose provider batches or seeks
     * supplies its own; the bridge otherwise derives both from `readFile` (and
     * `readFileStream` for ranges) on the host's side of the wire.
     */
    readMany?: (paths: readonly string[], options?: LongCall) => Promise<ReadManyWireRows>;
    readRange?: (path: string, offset: number, length: number) => Promise<Uint8Array<ArrayBuffer>>;
    /*
     * Pattern and content queries over the root's index (charter D14). A host
     * whose index answers them supplies its own; the bridge otherwise derives
     * all three from `statTree` (and `readFile` for `grep`) on the host's side
     * of the wire, so the view's mask applies to every row.
     */
    glob?: (pattern: string, options?: GlobOptions & LongCall) => Promise<FileStatEntry[]>;
    grep?: (pattern: string, options?: GrepOptions & LongCall) => Promise<GrepResult>;
    indexStats?: (path: string, options?: LongCall) => Promise<IndexStats>;
    /*
     * The mutating porcelain is the rooted surface's too (charter D4): one batch
     * in the mutation pipeline, mask-checked by the composed view above it. A
     * host that hands over a bare provider serves none of it, so every row is
     * optional — and `copyTree`'s entry filter is the *view's* own, never a
     * caller's, because a predicate does not cross a wire.
     */
  } & Partial<RootedPorcelain>;

/**
 * Caller-owned filter on a read content operation.
 *
 * The view's mask is inherited, never re-declared. `versionedOnly` is the
 * whole-project export's own choice: the registry's `versioned` rows are the
 * bytes that are the project, so records, caches and generated output stay out
 * of an archive a person shares.
 *
 * @public
 */
export type ArchiveOptions = ContentExportFilter;

/**
 * Caller-owned cap and shape of a rooted search.
 *
 * The mask is not here: the view applies its own policy before the index is
 * asked, so `maxResults` counts only rows the consumer may see.
 *
 * @public
 */
export type SearchOptions = { readonly maxResults?: number; readonly includeDirectories?: boolean };

/**
 * Digest each named file where its bytes live: one round trip, no bodies.
 *
 * Each value is the lowercase hexadecimal SHA-256 of the file's current bytes
 * (`sha256Bytes` from `@taucad/utils/hash`), or `'missing'` when nothing is at
 * that path — the runtime's own word for absence, which no digest can spell.
 * Every requested path is a key of the result. Bytes are the evidence,
 * never a size or mtime stamp, so a same-length rewrite inside one mtime tick
 * still yields a different digest.
 *
 * @public
 */
export type FileSystemBridgeHashFiles = (
  paths: readonly string[],
  options?: LongCall,
) => Promise<Record<string, string>>;

type FileSystemBridgeReadFile = {
  (path: string, options: 'utf8' | { readonly encoding: 'utf8' }): Promise<string>;
  (path: string, options?: { readonly encoding?: undefined }): Promise<Uint8Array<ArrayBuffer>>;
};

/**
 * What an **unrooted** (workspace) connection answers: the authority's topology
 * and the `/files` browser's scoped reads, and nothing that names a routed path.
 *
 * @public
 */
export type FileSystemBridgeUnrootedCalls = FileSystemBridgeWorkspaceService;

/**
 * Per-path content the wire carries **only** on a rooted connection (W11, H3).
 *
 * The signatures stay the authority's, because the composed view and the raw
 * rooted filesystem both answer them with those shapes; what changed is which
 * connection may name them. `readFile` and `writeFileChecked` are re-declared
 * because the wire carries neither an encoding-plus-scope bag nor an
 * `AbortSignal`.
 */
type RootedBridgeContentMethodName =
  | 'writeFile'
  | 'appendFile'
  | 'writeFiles'
  | 'mkdir'
  | 'readdir'
  | 'stat'
  | 'lstat'
  | 'move'
  | 'canMove'
  | 'canRename'
  | 'canCreate'
  | 'canDelete'
  | 'bulkMove'
  | 'unlink'
  | 'rmdir'
  | 'exists';

/**
 * What only a **rooted** connection answers (gate G-A F9, G-B G5; W11).
 *
 * `provenance` and `readdirWithStats` are the composed view's own and need a
 * consumer; `rename` is the rooted spelling of a move; the read content
 * operations, the index queries and the mutating porcelain are the rooted
 * surface's (charter D2, D3, D4) — and since W11 so is every per-path call,
 * masked by the view the connection named. An unrooted connection serves none of
 * them, so they are not on {@link FileSystemBridgeUnrootedCalls}.
 *
 * @public
 */
export type FileSystemBridgeRootedCalls = MachineSettingsService &
  Pick<RootedFileSystem, 'rename'> &
  Pick<WorkspaceFileService, RootedBridgeContentMethodName> &
  Pick<ComposedView, 'provenance' | 'readdirWithStats'> & {
    readFile: FileSystemBridgeReadFile;
    /**
     * A fenced record-log append (D23): refused with `EAPPENDSTALE` or
     * `EFENCED`, writing nothing, when the log is no longer the one the writer read.
     */
    appendFileFenced(path: string, data: Uint8Array<ArrayBuffer> | string, fence: AppendFence): Promise<void>;
    writeFileChecked(input: Omit<CheckedFileWrite, 'signal'>): Promise<CheckedFileWriteResult>;
    deleteFileChecked(input: {
      path: string;
      preconditions: readonly FileWritePrecondition[];
    }): Promise<CheckedFileWriteResult>;
    archive(path: string, options?: ArchiveOptions & LongCall): Promise<Blob>;
    contents(path: string, options?: ArchiveOptions & LongCall): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
    search(query: string, options?: SearchOptions & LongCall): Promise<FileStatEntry[]>;
    statTree(path: string, options?: LongCall): Promise<FileStatEntry[]>;
    copyTree(source: string, target: string, options?: LongCall): Promise<void>;
    duplicate(source: string, target: string, options?: LongCall): Promise<void>;
    hashFiles(paths: readonly string[], options?: LongCall): Promise<Record<string, string>>;
    /**
     * Read many files in one call (charter D14): each path's bytes, or
     * `'missing'`. A long call: it lives while the authority works, reports
     * progress per file and stops on the caller's abort. The bytes arrive
     * transferred, never copied, on a transport that transfers (I2).
     */
    readMany(paths: readonly string[], options?: LongCall): Promise<ReadManyResult>;
    /**
     * Bytes `[offset, offset + length)` of one file, clamped to its end; at most
     * {@link maxReadRangeBytes} per call.
     */
    readRange(path: string, offset: number, length: number): Promise<Uint8Array<ArrayBuffer>>;
    /**
     * Apply one changeset on the authority (charter D2, D14): every entry
     * admitted before the first I/O, one lock set, every entry's outcome in the
     * receipt. A long call: it lives while the authority applies it, so a
     * transport deadline never reports a changeset failed that is still being
     * applied (I10). An entry's `error` arrives as an `Error` carrying the
     * provider's `code`. A masked view (`agent`, `user`) answers every
     * entry's paths first: one masked entry refuses the whole changeset with
     * the mask's error (`EPERM`, or `EROFS` for an agent's records path) and
     * nothing is applied. A connection whose handlers apply no changeset (a
     * bare provider) refuses with `ENOTSUP`.
     */
    apply(changeset: Changeset, options?: ApplyOptions): Promise<ChangesetReceipt>;
    /** Index rows whose root-relative path matches a glob (`*.ts` matches at any depth). */
    glob(pattern: string, options?: GlobOptions & LongCall): Promise<FileStatEntry[]>;
    /** Lines of the root's text files that match a pattern; an invalid expression refuses with `EINVAL`. */
    grep(pattern: string, options?: GrepOptions & LongCall): Promise<GrepResult>;
    /** Totals of one subtree from the root's index. */
    indexStats(path: string, options?: LongCall): Promise<IndexStats>;
  };

/**
 * Every call the wire carries, rooted and unrooted alike.
 *
 * This is the *schema* set — one validator row per call name — not a promise
 * that any one connection serves all of it. A caller takes the half its
 * connection has: `FileSystemBridgeWorkspaceProxy` or
 * `FileSystemBridgeRootedProxy` in `filesystem-bridge.ts`.
 *
 * @public
 */
export type FileSystemBridgeService = FileSystemBridgeUnrootedCalls & FileSystemBridgeRootedCalls;

type FileSystemBridgeCallName = keyof FileSystemBridgeService;
type FileSystemBridgeCallArgs<Name extends FileSystemBridgeCallName> = Name extends 'readFile'
  ? [path: string, options?: 'utf8' | { readonly encoding?: 'utf8' }]
  : Name extends 'readScopedFile'
    ? [path: string, options: { readonly encoding?: 'utf8'; readonly scope: WorkspaceScope }]
    : Name extends 'apply'
      ? [changeset: FileSystemBridgeChangeset]
      : Parameters<FileSystemBridgeService[Name]>;
type FileSystemBridgeCallResult<Name extends FileSystemBridgeCallName> = Name extends 'readFile' | 'readScopedFile'
  ? string | Uint8Array<ArrayBuffer>
  : Name extends 'readMany'
    ? ReadManyWireRows
    : Awaited<ReturnType<FileSystemBridgeService[Name]>>;

type FileSystemBridgeCallSchemas = {
  readonly [Name in FileSystemBridgeCallName]: {
    readonly args: WireValidator<FileSystemBridgeCallArgs<Name>>;
    readonly result: WireValidator<FileSystemBridgeCallResult<Name>>;
  };
};

const stringSchema = z.string();
const finiteNumberSchema = z.number();
const plainRecordSchema = z.custom<Record<string, unknown>>(
  (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
);
const bytesSchema: z.ZodType<Uint8Array<ArrayBuffer>> = z.instanceof(Uint8Array);
const rootedPathSchema = z.string().refine((value) => {
  try {
    return assertRootedPath(value) === value;
  } catch {
    return false;
  }
});
const projectDirectoryPathSchema = rootedPathSchema.refine(
  (value) => value !== '' && !value.includes('/') && !value.startsWith('.'),
);

const durabilityClassValues = ['exclusive-append', 'stream-append', 'transactional-rewrite', 'ephemeral'] as const;
const durabilityClassSchema = z.enum(durabilityClassValues);
const providerCapabilitiesSchema: z.ZodType<ProviderCapabilities> = z.looseObject({
  persistent: z.boolean(),
  writable: z.boolean(),
  quotaBased: z.boolean(),
  // Version-1 peers sent only the three booleans. Current providers include durability.
  durability: durabilityClassSchema.optional(),
  coalescesWrites: z.boolean().optional(),
});

/* A stat carries content facts only when the host already knows them (I3). */
const fileStatSchema: z.ZodType<FileStat> = z.custom<FileStat>((value) => {
  const record = plainRecordSchema.safeParse(value);
  if (!record.success || !finiteNumberSchema.safeParse(record.data['size']).success) {
    return false;
  }
  if (!finiteNumberSchema.safeParse(record.data['mtimeMs']).success) {
    return false;
  }
  if (record.data['type'] === 'dir') {
    return true;
  }
  if (record.data['type'] !== 'file') {
    return false;
  }
  const { contentKind, lineCount } = record.data;
  return (
    (contentKind === undefined && lineCount === undefined) ||
    (contentKind === 'binary' && lineCount === undefined) ||
    (contentKind === 'text' && (lineCount === undefined || finiteNumberSchema.safeParse(lineCount).success))
  );
});

const fileStatEntrySchema: z.ZodType<FileStatEntry> = z.custom<FileStatEntry>((value) => {
  const record = plainRecordSchema.safeParse(value);
  return (
    record.success &&
    fileStatSchema.safeParse(value).success &&
    stringSchema.safeParse(record.data['path']).success &&
    stringSchema.safeParse(record.data['name']).success
  );
});

const fileStatEntriesSchema: z.ZodType<FileStatEntry[]> = z.custom<FileStatEntry[]>(
  (value) => Array.isArray(value) && value.every((entry) => fileStatEntrySchema.safeParse(entry).success),
);

const fileProvenanceSchema: z.ZodType<FileProvenance> = z.looseObject({
  source: z.enum(['project', 'dependencies', 'system-skills']),
  versioned: z.boolean(),
  agentAccess: z.enum(['read-write', 'read-only']),
  identity: z.string().optional(),
  overrides: z.string().optional(),
});

const composedDirectoryRowSchema: z.ZodType<{ name: string } & FileStat> = z.custom<{ name: string } & FileStat>(
  (value) => {
    const record = plainRecordSchema.safeParse(value);
    return (
      record.success &&
      stringSchema.safeParse(record.data['name']).success &&
      fileStatSchema.safeParse(value).success &&
      (record.data['provenance'] === undefined || fileProvenanceSchema.safeParse(record.data['provenance']).success)
    );
  },
);

const composedDirectoryRowsSchema: z.ZodType<Array<{ name: string } & FileStat>> = z.custom<
  Array<{ name: string } & FileStat>
>((value) => Array.isArray(value) && value.every((row) => composedDirectoryRowSchema.safeParse(row).success));

const mutationErrorCodeValues = [
  'NAME_EXISTS',
  'INVALID_NAME',
  'READ_ONLY_MOUNT',
  'BUNDLED_TYPES_WORKSPACE',
  'MISSING_WORKSPACE_HANDLE',
  'NOT_FOUND',
  'OPERATION_FAILED',
] as const;
const mutationErrorWireShapeSchema = z.looseObject({
  code: z.enum(mutationErrorCodeValues),
  path: z.string(),
  message: z.string(),
  target: z.string().optional(),
});
const mutationErrorSchema = z.custom<WorkspaceMutationError>(
  (value) => mutationErrorWireShapeSchema.safeParse(value).success,
);
const mutationResultSchema = z.union([z.literal(true), mutationErrorSchema]);

const directoryHandleSchema = z.custom<FileSystemDirectoryHandle>(
  (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
);
const storageRootConfigSchema: z.ZodType<StorageRootConfig> = z.discriminatedUnion('backend', [
  z.looseObject({ backend: z.literal('webaccess'), directoryHandle: directoryHandleSchema, workspaceId: z.string() }),
  z.looseObject({ backend: z.literal('indexeddb') }),
  z.looseObject({ backend: z.literal('opfs') }),
  z.looseObject({ backend: z.literal('node'), path: z.string() }),
]);
const projectRootConfigSchema: z.ZodType<ProjectRootConfig> = z.discriminatedUnion('backend', [
  z.looseObject({
    projectId: projectIdSchema,
    backend: z.literal('webaccess'),
    workspaceId: z.string(),
    providerBasePath: projectDirectoryPathSchema,
    directoryHandle: z.undefined().optional(),
  }),
  z.looseObject({
    projectId: projectIdSchema,
    backend: z.literal('indexeddb'),
    providerBasePath: projectDirectoryPathSchema,
  }),
  z.looseObject({
    projectId: projectIdSchema,
    backend: z.literal('opfs'),
    providerBasePath: projectDirectoryPathSchema,
  }),
  z.looseObject({
    projectId: projectIdSchema,
    backend: z.literal('memory'),
    storageRootKey: z.string(),
    providerBasePath: projectDirectoryPathSchema,
  }),
  z.looseObject({
    projectId: projectIdSchema,
    backend: z.literal('node'),
    path: z.string(),
    providerBasePath: projectDirectoryPathSchema,
  }),
]);
const projectLocatorSchema: z.ZodType<ProjectLocator> = z.discriminatedUnion('backend', [
  z.looseObject({
    backend: z.literal('webaccess'),
    storageRootKey: z.string(),
    relativeDirectory: projectDirectoryPathSchema,
    workspaceId: z.string(),
  }),
  z.looseObject({
    backend: z.literal('indexeddb'),
    storageRootKey: z.string(),
    relativeDirectory: projectDirectoryPathSchema,
  }),
  z.looseObject({
    backend: z.literal('opfs'),
    storageRootKey: z.string(),
    relativeDirectory: projectDirectoryPathSchema,
  }),
  z.looseObject({
    backend: z.literal('node'),
    storageRootKey: z.string(),
    relativeDirectory: projectDirectoryPathSchema,
    path: z.string(),
  }),
]);
const workspaceScopeVariants = [
  z.looseObject({ backend: z.literal('webaccess'), directoryHandle: directoryHandleSchema, workspaceId: z.string() }),
  z.looseObject({ backend: z.literal('indexeddb') }),
  z.looseObject({ backend: z.literal('opfs') }),
  z.looseObject({ backend: z.literal('memory'), storageRootKey: z.string() }),
  z.looseObject({ backend: z.literal('node'), path: z.string() }),
] as const;
const workspaceScopeSchema: z.ZodType<WorkspaceScope> = z.discriminatedUnion('backend', workspaceScopeVariants);
/* A mount config is a scope plus its registration-time classification (RC6 /
 * S5 work 2). Same variants, one extra required field, so the wire cannot carry
 * an unclassified mount across the bridge either. */
const mountPathClassSchema = z.enum(['authored', 'derived', 'authority-metadata']);
const mountConfigSchema: z.ZodType<MountConfig> = z.discriminatedUnion('backend', [
  workspaceScopeVariants[0].extend({ class: mountPathClassSchema }),
  workspaceScopeVariants[1].extend({ class: mountPathClassSchema }),
  workspaceScopeVariants[2].extend({ class: mountPathClassSchema }),
  workspaceScopeVariants[3].extend({ class: mountPathClassSchema }),
  workspaceScopeVariants[4].extend({ class: mountPathClassSchema }),
]);

const manifestIssueSchema = z.discriminatedUnion('code', [
  z.looseObject({ code: z.literal('manifest-unreadable'), message: z.string() }),
  z.looseObject({ code: z.literal('manifest-missing') }),
  z.looseObject({ code: z.literal('manifest-invalid-json'), message: z.string() }),
  z.looseObject({ code: z.literal('manifest-too-large'), maxBytes: z.number() }),
  z.looseObject({
    code: z.literal('manifest-unknown-schema'),
    found: z.unknown().optional(),
    supported: z.literal(projectManifestSchemaUrl),
  }),
  z.looseObject({ code: z.literal('manifest-invalid'), issues: z.array(z.unknown()) }),
]) as z.ZodType<ProjectManifestParseIssue>;
/* An identified entry's `issue` marks a degraded manifest: it routes, and its bytes await Repair. */
const identifiedEntryShape = {
  projectId: projectIdSchema,
  manifest: projectManifestSchema,
  locator: projectLocatorSchema,
  issue: manifestIssueSchema.optional(),
};
const projectDiscoveryEntrySchema: z.ZodType<ProjectDiscoveryEntry> = z.discriminatedUnion('status', [
  z.looseObject({ status: z.literal('valid'), ...identifiedEntryShape }),
  z.looseObject({ status: z.literal('duplicate-id'), ...identifiedEntryShape }),
  z.looseObject({ status: z.literal('route-blocked'), ...identifiedEntryShape }),
  z.looseObject({
    status: z.literal('adoption-required'),
    manifest: projectManifestSchema,
    locator: projectLocatorSchema,
    issue: manifestIssueSchema,
  }),
  z.looseObject({
    status: z.literal('invalid'),
    locator: projectLocatorSchema,
    issue: z.union([
      manifestIssueSchema,
      z.object({ code: z.enum(['identity-invalid', 'identity-unavailable']), message: z.string() }),
      z.object({
        code: z.literal('identity-conflict'),
        expectedProjectId: projectIdSchema,
        actualProjectId: projectIdSchema,
      }),
    ]),
  }),
]);
const projectRootDiscoveryStatusSchema: z.ZodType<ProjectRootDiscoveryStatus> = z.discriminatedUnion('status', [
  z.looseObject({ status: z.literal('complete'), root: storageRootConfigSchema }),
  z.looseObject({ status: z.literal('inaccessible'), root: storageRootConfigSchema, reason: z.string() }),
]);

/**
 * A watch request on the wire. `form: 'change-sets'` asks a rooted connection
 * for its change-set form (charter D6): one {@link ChangeSet} frame per
 * committed changeset that reaches the request, instead of a frame per path.
 *
 * @public
 */
export type FileSystemBridgeWatchRequest = WatchRequest & {
  readonly form?: 'change-sets' | 'events';
  readonly coalesce?: ChangeSetWatchRequest['coalesce'];
};

/**
 * One frame of a rooted connection's event channel (charter D14): the one
 * channel per port that carries the root's change sets and the authority's
 * own news.
 *
 * - `changeSet`: one committed changeset as the connection's view sees it.
 * - `compute-restarted`: the authority's compute worker died, as its
 *   supervisor reported it: `failedCalls` failed typed, `restarts` within the
 *   supervisor's window so far, and whether it `abandoned` the worker for its
 *   fallback. No file state was lost: the compute worker holds none.
 * - `authority-lost`: the authority itself is gone. Never sent on the wire —
 *   a dead authority sends nothing — the client says it, once, when the
 *   connection closes under it or a call finds the authority unresponsive
 *   (`PEER_UNRESPONSIVE`). Nothing the authority had not receipted may be claimed
 *   saved; the recovery path is a reload.
 *
 * @public
 */
export type FileSystemBridgeEvent =
  | Readonly<{ kind: 'changeSet'; set: ChangeSet }>
  | ComputeRestartedEvent
  | Readonly<{ kind: 'authority-lost' }>;

/** The event frames the wire carries: every {@link FileSystemBridgeEvent} but `authority-lost`. @public */
export type FileSystemBridgeWireEvent = Exclude<FileSystemBridgeEvent, { kind: 'authority-lost' }>;

/**
 * One frame of a bridge watch: a per-path event, a change set for a
 * `form: 'change-sets'` request, or an event for a `form: 'events'` request.
 *
 * @public
 */
export type FileSystemBridgeWatchFrame = WatchEvent | ChangeSet | FileSystemBridgeWireEvent;

const watchRequestSchema: z.ZodType<FileSystemBridgeWatchRequest> = z.looseObject({
  paths: z.array(z.string()),
  recursive: z.boolean().optional(),
  includes: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
  form: z.enum(['change-sets', 'events']).optional(),
  coalesce: z.enum(['immediate', 'frame']).optional(),
});
const watchEventSchema: z.ZodType<WatchEvent> = z.discriminatedUnion('type', [
  z.looseObject({ type: z.literal('reset') }),
  z.looseObject({ type: z.literal('change'), path: z.string() }),
  z.looseObject({ type: z.literal('delete'), path: z.string() }),
  z.looseObject({ type: z.literal('rename'), oldPath: z.string(), newPath: z.string() }),
]);

const filesystemBackendSchema = z.enum(filesystemBackends);
const changeSetEntrySchema = z.looseObject({
  op: z.enum(['created', 'written', 'deleted', 'moved']),
  path: z.string(),
  oldPath: z.string().optional(),
  kind: z.enum(['file', 'dir']),
  target: z.looseObject({ type: z.enum(['file', 'dir']), size: z.number(), mtimeMs: z.number() }).optional(),
});
const changeSetSchema: z.ZodType<ChangeSet> = z.looseObject({
  generation: z.number(),
  origin: z.string().optional(),
  backend: filesystemBackendSchema.optional(),
  entries: z.array(changeSetEntrySchema),
  touchedDirectories: z.array(z.string()),
  segments: z.array(z.looseObject({ path: z.string(), writes: z.number() })).optional(),
  reset: z
    .looseObject({
      prefix: z.string(),
      reason: z.enum(['overflow', 'observer-uncertain', 'topology', 'sequence-gap', 'permission-lost']),
    })
    .optional(),
});
const wireEventSchema: z.ZodType<FileSystemBridgeWireEvent> = z.discriminatedUnion('kind', [
  z.looseObject({ kind: z.literal('changeSet'), set: changeSetSchema }),
  z.looseObject({
    kind: z.literal('compute-restarted'),
    failedCalls: z.number().int().nonnegative(),
    restarts: z.number().int().nonnegative(),
    abandoned: z.boolean(),
  }),
]);
const watchFrameSchema: z.ZodType<FileSystemBridgeWatchFrame> = z.union([
  watchEventSchema,
  changeSetSchema,
  wireEventSchema,
]);
const changeEventStatSchema = z.looseObject({
  type: z.enum(['file', 'dir']),
  size: z.number(),
  mtimeMs: z.number(),
});
const pathChangeEventSchema = (
  type: 'fileWritten' | 'fileDeleted' | 'directoryCreated' | 'directoryDeleted' | 'directoryChanged',
) =>
  z.looseObject({
    type: z.literal(type),
    path: z.string(),
    backend: filesystemBackendSchema,
    target: changeEventStatSchema.optional(),
  });
const renameChangeEventSchema = (type: 'fileRenamed' | 'directoryRenamed') =>
  z.looseObject({
    type: z.literal(type),
    oldPath: z.string(),
    newPath: z.string(),
    backend: filesystemBackendSchema,
    target: changeEventStatSchema.optional(),
  });
const copyChangeEventSchema = (type: 'fileCopied' | 'directoryCopied') =>
  z.looseObject({
    type: z.literal(type),
    sourcePath: z.string(),
    targetPath: z.string(),
    backend: filesystemBackendSchema,
    target: changeEventStatSchema.optional(),
  });
const pathChangeEventBranches = [
  pathChangeEventSchema('fileWritten'),
  pathChangeEventSchema('fileDeleted'),
  renameChangeEventSchema('fileRenamed'),
  copyChangeEventSchema('fileCopied'),
  pathChangeEventSchema('directoryCreated'),
  pathChangeEventSchema('directoryDeleted'),
  renameChangeEventSchema('directoryRenamed'),
  copyChangeEventSchema('directoryCopied'),
  pathChangeEventSchema('directoryChanged'),
  z.looseObject({ type: z.literal('backendChanged'), backend: filesystemBackendSchema }),
] as const;
/* One delivery carries one fact, or every fact of one changeset as a `changeSet` envelope (charter D6). */
const changeEventSchema: z.ZodType<ChangeEvent> = z.discriminatedUnion('type', [
  ...pathChangeEventBranches,
  z.looseObject({
    type: z.literal('changeSet'),
    entries: z.array(z.discriminatedUnion('type', [...pathChangeEventBranches])),
  }),
]);

const fileTreeNodeSchema: z.ZodType<FileTreeNode> = z.custom<FileTreeNode>((value) => {
  const record = plainRecordSchema.safeParse(value);
  if (!record.success) {
    return false;
  }
  const node = record.data;
  if (!stringSchema.safeParse(node['id']).success || !stringSchema.safeParse(node['name']).success) {
    return false;
  }
  if (!finiteNumberSchema.safeParse(node['size']).success || !finiteNumberSchema.safeParse(node['mtimeMs']).success) {
    return false;
  }
  if (node['children'] !== undefined) {
    return (
      Array.isArray(node['children']) && node['children'].every((child) => fileTreeNodeSchema.safeParse(child).success)
    );
  }
  return (
    (node['contentKind'] === 'binary' && node['lineCount'] === undefined) ||
    (node['contentKind'] === 'text' &&
      (node['lineCount'] === undefined || finiteNumberSchema.safeParse(node['lineCount']).success))
  );
});
const fileTreeNodesSchema: z.ZodType<FileTreeNode[]> = z.custom<FileTreeNode[]>(
  (value) => Array.isArray(value) && value.every((node) => fileTreeNodeSchema.safeParse(node).success),
);
const directoryContentsSchema: z.ZodType<Record<string, Uint8Array<ArrayBuffer>>> = z.custom<
  Record<string, Uint8Array<ArrayBuffer>>
>((value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor && bytesSchema.safeParse(descriptor.value).success;
  });
});

const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const fileDigestsSchema: z.ZodType<Record<string, string>> = z.record(
  z.string(),
  z.union([sha256HexSchema, z.literal('missing')]),
);

type NoArguments = Parameters<() => void>;
const noArgs: z.ZodType<NoArguments> = z.tuple([]);
const oneStringArgument = z.tuple([z.string()]);
const twoStringArgs = z.tuple([z.string(), z.string()]);
/* `null` is admitted alongside `undefined` because msgpack decodes an absent
 * response payload as nil. Normalize it so every transport resolves void alike. */
const voidResult: z.ZodType<void> = z.union([z.undefined(), z.null()]).transform(() => undefined);
const booleanResult = z.boolean();
const recursiveOptionsSchema = z.looseObject({ recursive: z.boolean().optional() });
const scopedOptionsSchema = z.looseObject({ scope: workspaceScopeSchema });
/** The rooted read content operations take the caller's own export filter. */
const archiveOptionsSchema = z.looseObject({ versionedOnly: z.boolean().optional() });

const helloVersionProbeSchema = z.looseObject({ v: z.unknown().optional() });
const fileSystemBridgeHelloValidator: z.ZodType<FileSystemBridgeHello> = z.preprocess(
  (value) => {
    const probe = helloVersionProbeSchema.safeParse(value);
    const receivedVersion = probe.success ? probe.data.v : undefined;
    if (receivedVersion !== fileSystemBridgeProtocolVersion) {
      throw new FileSystemBridgeProtocolVersionError(receivedVersion);
    }
    return value;
  },
  z.discriminatedUnion('state', [
    z.looseObject({
      v: z.literal(fileSystemBridgeProtocolVersion),
      state: z.literal('ready'),
      capabilities: providerCapabilitiesSchema,
      watchable: z.boolean(),
      hashable: z.boolean().optional(),
    }),
    z.looseObject({
      v: z.literal(fileSystemBridgeProtocolVersion),
      state: z.literal('workspace'),
      capabilities: z.null(),
      watchable: z.boolean(),
    }),
    z.looseObject({
      v: z.literal(fileSystemBridgeProtocolVersion),
      state: z.literal('unavailable'),
      capabilities: z.null(),
      watchable: z.literal(false),
      error: z.looseObject({ code: z.literal('ROOT_UNAVAILABLE'), message: z.string() }),
    }),
  ]),
);

const readFileOptionsSchema = z.union([z.literal('utf8'), z.looseObject({ encoding: z.literal('utf8').optional() })]);
const scopedReadFileOptionsSchema = z.looseObject({
  encoding: z.literal('utf8').optional(),
  scope: workspaceScopeSchema,
});
const writePayloadSchema = z.union([z.string(), bytesSchema]);
const checkedWriteInputSchema: z.ZodType<Omit<CheckedFileWrite, 'signal'>> = z.object({
  path: z.string(),
  data: writePayloadSchema,
  preconditions: z.array(z.object({ path: z.string(), expected: writePayloadSchema.nullable() })),
});
const checkedWriteResultSchema: z.ZodType<CheckedFileWriteResult> = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['applied', 'unchanged']), content: bytesSchema }),
  z.object({
    status: z.literal('conflict'),
    conflicts: z.array(z.object({ path: z.string(), actual: bytesSchema.nullable() })),
  }),
]);
const moveEditSchema = z.looseObject({ source: z.string(), target: z.string() });
const bulkMoveResultSchema = z.looseObject({
  moved: z.array(z.looseObject({ edit: moveEditSchema, stat: fileStatSchema })),
  failed: z.array(z.looseObject({ edit: moveEditSchema, error: mutationErrorSchema })),
});
const projectRootConfigurationSchema = z.looseObject({
  projects: z.array(projectRootConfigSchema),
  roots: z.array(storageRootConfigSchema),
});
const projectDiscoveryResultSchema = z.looseObject({
  entries: z.array(projectDiscoveryEntrySchema),
  roots: z.array(projectRootDiscoveryStatusSchema),
});
const pendingProjectCommitResultSchema = discriminatedResultUnion('status', [
  z.looseObject({ status: z.enum(['committed', 'already-committed', 'unidentifiable-manifest']) }),
  z.looseObject({ status: z.literal('identity-mismatch'), actualProjectId: projectIdSchema }),
]);
const permanentDeleteInputSchema = z.looseObject({
  projectId: projectIdSchema,
  providerBasePath: projectDirectoryPathSchema,
  scope: storageRootConfigSchema,
});
const permanentDeleteResultSchema = discriminatedResultUnion('status', [
  z.looseObject({ status: z.enum(['deleted', 'absent', 'unidentifiable']) }),
  z.looseObject({ status: z.literal('identity-mismatch'), actualProjectId: projectIdSchema }),
]);
const searchOptionsSchema = z.looseObject({
  maxResults: z.number().optional(),
  includeDirectories: z.boolean().optional(),
});
const countSchema = z.number().int().nonnegative();
const globOptionsSchema = z.looseObject({
  path: rootedPathSchema.optional(),
  maxResults: countSchema.optional(),
});
const grepOptionsSchema = z.looseObject({
  path: rootedPathSchema.optional(),
  glob: z.string().optional(),
  caseSensitive: z.boolean().optional(),
  fixedStrings: z.boolean().optional(),
  maxResults: countSchema.max(maxGrepResults).optional(),
  maxFileBytes: countSchema.optional(),
  context: countSchema.max(maxGrepContext).optional(),
});
const grepResultSchema: z.ZodType<GrepResult> = z.looseObject({
  matches: z.array(
    z.looseObject({
      path: z.string(),
      line: z.number().int().positive(),
      column: z.number().int().positive(),
      text: z.string(),
      before: z.array(z.string()).optional(),
      after: z.array(z.string()).optional(),
    }),
  ),
  filesSearched: countSchema,
  filesSkipped: countSchema,
  truncated: z.boolean(),
});
const indexStatsSchema: z.ZodType<IndexStats> = z.looseObject({
  files: countSchema,
  bytes: countSchema,
  textFiles: countSchema,
  binaryFiles: countSchema,
  lines: countSchema,
});
const changesetPhaseSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]).optional();
const changesetEntrySchema: z.ZodType<FileSystemBridgeChangesetEntry> = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('write'),
    path: z.string(),
    data: z.union([z.string(), bytesSchema, z.instanceof(Blob)]),
    mode: z.enum(['100644', '100755']).optional(),
    create: z.boolean().optional(),
    phase: changesetPhaseSchema,
  }),
  z.strictObject({
    op: z.literal('append'),
    path: z.string(),
    data: writePayloadSchema,
    fence: z.strictObject({ expectedLength: countSchema, token: z.number().int().optional() }).optional(),
    phase: changesetPhaseSchema,
  }),
  z.strictObject({
    op: z.literal('delete'),
    path: z.string(),
    kind: z.enum(['file', 'dir']).optional(),
    recursive: z.boolean().optional(),
    phase: changesetPhaseSchema,
  }),
  z.strictObject({
    op: z.literal('move'),
    from: z.string(),
    to: z.string(),
    replace: z.boolean().optional(),
    phase: changesetPhaseSchema,
  }),
  z.strictObject({
    op: z.literal('mkdir'),
    path: z.string(),
    recursive: z.boolean().optional(),
    phase: changesetPhaseSchema,
  }),
]);
const changesetSchema: z.ZodType<FileSystemBridgeChangeset> = z.strictObject({
  entries: z.array(changesetEntrySchema).max(maximumChangesetEntries),
  lifecycle: z.boolean().optional(),
});
/* An entry's error crosses as data — an `Error` survives structured clone but
 * not every codec — and the client stands it back up as an `Error`. */
const changesetEntryErrorSchema = z.looseObject({ name: z.string(), message: z.string(), code: z.string().optional() });
const changesetReceiptSchema: z.ZodType<ChangesetReceipt> = z.looseObject({
  entries: z.array(
    z.looseObject({
      index: countSchema,
      outcome: z.enum(['applied', 'failed', 'uncertain', 'skipped']),
      error: changesetEntryErrorSchema.optional(),
      kind: z.enum(['file', 'dir']).optional(),
      durability: durabilityClassSchema.optional(),
    }),
  ),
  applied: countSchema,
  failed: countSchema,
  uncertain: countSchema,
  skipped: countSchema,
  state: z.enum(['applied', 'partially-applied', 'known-not-applied', 'potentially-applied']),
});

const machineSettingsTypeIdSchema = z.custom<MachineSettingsRecord['typeId']>(
  (value) =>
    typeof value === 'string' && value.length <= 64 && /^[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)+$/u.test(value),
);
const settingsJsonSchema = z.custom<MachineSettingsValue>((value) => {
  try {
    cloneBoundedJson(value, {
      code: 'MACHINE_SETTINGS_WIRE',
      maximumDepth: 24,
      maximumNodes: 8192,
      maximumCharacters: 262_144,
    });
    return true;
  } catch {
    return false;
  }
});
const settingsKey = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => !['__proto__', 'constructor', 'prototype'].includes(value));
const machineSettingsRecordSchema: z.ZodType<MachineSettingsRecord> = z
  .strictObject({
    version: z.literal(1),
    typeId: machineSettingsTypeIdSchema,
    activeProfile: z.string().min(1).max(64),
    profiles: z
      .record(
        settingsKey,
        z.strictObject({
          name: z.string().min(1).max(128),
          configurations: z
            .record(
              settingsKey,
              z.strictObject({
                version: z.string().min(1).max(128),
                values: z.record(settingsKey, settingsJsonSchema),
              }),
            )
            .refine((value) => Object.keys(value).length <= 32),
        }),
      )
      .refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 16),
  })
  .refine((value) => Object.hasOwn(value.profiles, value.activeProfile));
const machineSettingsSnapshotSchema: z.ZodType<MachineSettingsSnapshot> = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('current'),
    record: machineSettingsRecordSchema,
  }),
  z.strictObject({ status: z.literal('absent') }),
  z.strictObject({
    status: z.literal('refused'),
    code: z.enum(['INVALID_RECORD', 'NEWER_RECORD', 'MACHINE_TYPE_MISMATCH']),
    message: z.string(),
    pointer: z.string().optional(),
  }),
  z.strictObject({
    status: z.literal('unavailable'),
    code: z.literal('SETTINGS_UNAVAILABLE'),
    message: z.string(),
  }),
]);
const machineSettingsEditSchema: z.ZodType<MachineSettingsEdit> = z.strictObject({
  operationId: z.string().min(1).max(128),
  typeId: machineSettingsTypeIdSchema,
  base: machineSettingsRecordSchema.nullable(),
  next: machineSettingsRecordSchema,
});
const machineSettingsSaveSchema: z.ZodType<MachineSettingsSave> = z.union([
  z.strictObject({
    status: z.literal('saved'),
    record: machineSettingsRecordSchema,
  }),
  z.strictObject({
    status: z.literal('conflict'),
    message: z.string(),
    current: machineSettingsSnapshotSchema,
  }),
  z.strictObject({
    status: z.enum(['refused', 'uncertain']),
    message: z.string(),
  }),
]);

const callSchemas = {
  readMachineSettings: {
    args: z.tuple([machineSettingsTypeIdSchema]),
    result: machineSettingsSnapshotSchema,
  },
  editMachineSettings: {
    args: z.tuple([machineSettingsEditSchema]),
    result: machineSettingsSaveSchema,
  },
  machineSettingsSettlement: {
    args: z.tuple([z.string().min(1).max(128)]),
    result: machineSettingsSaveSchema,
  },
  readFile: {
    args: z.tuple([z.string(), readFileOptionsSchema.optional()]),
    result: z.union([z.string(), bytesSchema]),
  },
  writeFile: { args: z.tuple([z.string(), writePayloadSchema]), result: voidResult },
  writeFileChecked: { args: z.tuple([checkedWriteInputSchema]), result: checkedWriteResultSchema },
  deleteFileChecked: {
    args: z.tuple([
      z.object({
        path: z.string(),
        preconditions: z.array(z.object({ path: z.string(), expected: writePayloadSchema.nullable() })),
      }),
    ]),
    result: checkedWriteResultSchema,
  },
  appendFile: { args: z.tuple([z.string(), writePayloadSchema]), result: voidResult },
  appendFileFenced: {
    args: z.tuple([
      z.string(),
      writePayloadSchema,
      z.strictObject({
        expectedLength: z.number().int().nonnegative(),
        token: z.number().int().optional(),
      }),
    ]),
    result: voidResult,
  },
  writeFiles: {
    args: z.tuple([z.record(z.string(), z.looseObject({ content: writePayloadSchema }))]),
    result: voidResult,
  },
  mkdir: { args: z.tuple([z.string(), recursiveOptionsSchema.optional()]), result: voidResult },
  readdir: { args: oneStringArgument, result: z.array(z.string()) },
  stat: { args: oneStringArgument, result: fileStatSchema },
  lstat: { args: oneStringArgument, result: fileStatSchema },
  move: { args: twoStringArgs, result: fileStatSchema },
  canMove: { args: twoStringArgs, result: mutationResultSchema },
  canRename: { args: twoStringArgs, result: mutationResultSchema },
  canCreate: { args: z.tuple([z.string(), z.enum(['file', 'directory'])]), result: mutationResultSchema },
  canDelete: { args: oneStringArgument, result: mutationResultSchema },
  bulkMove: { args: z.tuple([z.array(moveEditSchema)]), result: bulkMoveResultSchema },
  unlink: { args: oneStringArgument, result: voidResult },
  rmdir: { args: z.tuple([z.string(), recursiveOptionsSchema.optional()]), result: voidResult },
  exists: { args: oneStringArgument, result: booleanResult },
  mount: { args: z.tuple([z.string(), mountConfigSchema]), result: voidResult },
  unmount: { args: oneStringArgument, result: voidResult },
  configureProjectRoots: { args: z.tuple([projectRootConfigurationSchema]), result: voidResult },
  listProjectManifests: { args: noArgs, result: projectDiscoveryResultSchema },
  commitPendingProjectDirectory: {
    args: z.tuple([pendingProjectCommitInputSchema]),
    result: pendingProjectCommitResultSchema,
  },
  adoptProjectDirectory: {
    args: z.tuple([projectLocatorSchema, z.object({ id: projectIdSchema.optional() }).optional()]),
    result: z.object({ projectId: projectIdSchema, manifest: projectManifestSchema }),
  },
  permanentlyDeleteProjectDirectory: {
    args: z.tuple([permanentDeleteInputSchema]),
    result: permanentDeleteResultSchema,
  },
  /* The `/files` browser's three, every one of them scope-required (charter D5,
   * W11): a routed path is content, and content answers on its own root. */
  readScopedFile: {
    args: z.tuple([z.string(), scopedReadFileOptionsSchema]),
    result: z.union([z.string(), bytesSchema]),
  },
  readScopedShallowDirectory: { args: z.tuple([z.string(), scopedOptionsSchema]), result: fileTreeNodesSchema },
  getScopedZippedDirectory: { args: z.tuple([z.string(), scopedOptionsSchema]), result: z.instanceof(Blob) },
  disposeStorageRoot: { args: oneStringArgument, result: voidResult },
  pollExternalChanges: {
    args: z.union([z.tuple([]), z.tuple([z.string().optional()])]),
    result: booleanResult,
  },
  rename: { args: twoStringArgs, result: voidResult },
  readdirWithStats: { args: oneStringArgument, result: composedDirectoryRowsSchema },
  provenance: { args: oneStringArgument, result: fileProvenanceSchema },
  archive: { args: z.tuple([z.string(), archiveOptionsSchema.optional()]), result: z.instanceof(Blob) },
  contents: { args: z.tuple([z.string(), archiveOptionsSchema.optional()]), result: directoryContentsSchema },
  search: {
    args: z.tuple([z.string(), searchOptionsSchema.optional()]),
    result: fileStatEntriesSchema,
  },
  statTree: { args: oneStringArgument, result: fileStatEntriesSchema },
  copyTree: { args: twoStringArgs, result: voidResult },
  duplicate: { args: twoStringArgs, result: voidResult },
  hashFiles: { args: z.tuple([z.array(rootedPathSchema)]), result: fileDigestsSchema },
  readMany: {
    args: z.tuple([z.array(rootedPathSchema).max(maxReadManyPaths)]),
    result: z.array(z.tuple([z.string(), z.union([bytesSchema, z.literal('missing')])])),
  },
  readRange: {
    args: z.tuple([
      rootedPathSchema,
      z.number().int().nonnegative(),
      z.number().int().nonnegative().max(maxReadRangeBytes),
    ]),
    result: bytesSchema,
  },
  apply: { args: z.tuple([changesetSchema]), result: changesetReceiptSchema },
  glob: { args: z.tuple([z.string(), globOptionsSchema.optional()]), result: fileStatEntriesSchema },
  grep: { args: z.tuple([z.string(), grepOptionsSchema.optional()]), result: grepResultSchema },
  indexStats: { args: z.tuple([rootedPathSchema]), result: indexStatsSchema },
} satisfies FileSystemBridgeCallSchemas;

const broadcastValidator = z.looseObject({ event: z.literal('fileChanged'), data: changeEventSchema });

/** Exact runtime-validator inventory for the filesystem bridge domain. @public */
export const fileSystemBridgeSchemas = {
  hello: fileSystemBridgeHelloValidator,
  calls: callSchemas,
  listens: {
    watch: {
      args: watchRequestSchema,
      event: watchFrameSchema,
    },
    broadcast: { event: broadcastValidator },
  },
} satisfies BridgeProtocolSchemas<FileSystemBridgeHello, FileSystemBridgeWatchRequest, FileSystemBridgeWatchFrame>;

type HelloInput =
  | {
      readonly state: 'ready';
      readonly capabilities: ProviderCapabilities;
      readonly watchable: boolean;
      readonly hashable?: boolean;
    }
  | { readonly state: 'workspace'; readonly watchable: boolean }
  | { readonly state: 'unavailable'; readonly error: { readonly code: 'ROOT_UNAVAILABLE'; readonly message: string } };

/** The sole first-party filesystem hello construction boundary. @public */
export const createFileSystemBridgeHello = (input: HelloInput): FileSystemBridgeHello => {
  if (input.state === 'ready') {
    return { v: fileSystemBridgeProtocolVersion, ...input };
  }
  if (input.state === 'workspace') {
    return { v: fileSystemBridgeProtocolVersion, ...input, capabilities: null };
  }
  return {
    v: fileSystemBridgeProtocolVersion,
    state: 'unavailable',
    capabilities: null,
    watchable: false,
    error: input.error,
  };
};
