import type {
  ProviderCapabilities,
  FileSystemProvider,
  FileTreeNode,
  ProjectDiscoveryEntry,
  ProjectLocator,
  ProjectRootConfig,
  ProjectRootDiscoveryStatus,
  RootedFileSystem,
  MountConfig,
  StorageRootConfig,
  WatchEvent,
  WatchRequest,
  WorkspaceFileService,
  WorkspaceMutationError,
  WorkspaceScope,
} from '@taucad/filesystem';
import { pendingProjectCommitInputSchema } from '@taucad/filesystem';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import type {
  ChangeEvent,
  CheckedFileWrite,
  CheckedFileWriteResult,
  FileProvenance,
  FileStat,
  FileStatEntry,
  ProjectManifestParseIssue,
} from '@taucad/types';
import { projectManifestSchema, projectManifestSchemaUrl } from '@taucad/types';
import { filesystemBackends } from '@taucad/types/constants';
import type { BridgeProtocolSchemas } from '@taucad/rpc/bridge';
import type { WireValidator } from '@taucad/rpc';
import { assertRootedPath } from '@taucad/utils/path';
import { z } from 'zod';

/** Current filesystem bridge protocol version. @public */
export const fileSystemBridgeProtocolVersion = 1;

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

type WorkspaceBridgeMethodName =
  | 'readFile'
  | 'writeFile'
  | 'writeFileChecked'
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
  | 'exists'
  | 'getDirectoryStat'
  | 'getDirectoryContents'
  | 'duplicateFile'
  | 'copyDirectory'
  | 'getZippedDirectory'
  | 'mount'
  | 'unmount'
  | 'configureProjectRoots'
  | 'listProjectManifests'
  | 'commitPendingProjectDirectory'
  | 'adoptProjectDirectory'
  | 'permanentlyDeleteProjectDirectory'
  | 'readShallowDirectory'
  | 'disposeStorageRoot'
  | 'readDirectory'
  | 'searchFiles'
  | 'pollExternalChanges';

/** Workspace-wide bridge calls, with signatures derived from the authority service. @public */
export type FileSystemBridgeWorkspaceService = Pick<WorkspaceFileService, WorkspaceBridgeMethodName>;

/** Rooted/runtime bridge calls, including watch registration that may cross an asynchronous authority boundary. @public */
export type FileSystemBridgeRuntimeService = FileSystemProvider & {
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
};

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
export type ArchiveOptions = { readonly versionedOnly?: boolean };

/**
 * Caller-owned cap and shape of a rooted search.
 *
 * The mask is not here: the view applies its own policy before the index is
 * asked, so `maxResults` counts only rows the consumer may see.
 *
 * @public
 */
export type SearchOptions = { readonly maxResults?: number; readonly includeDirectories?: boolean };

type FileSystemBridgeReadFile = {
  (path: string, options: 'utf8' | { readonly encoding: 'utf8'; readonly scope?: WorkspaceScope }): Promise<string>;
  (path: string, options?: { readonly scope?: WorkspaceScope }): Promise<Uint8Array<ArrayBuffer>>;
};

/**
 * Complete callable surface supported by a filesystem bridge proxy.
 *
 * The last two rows are the composed view's own (L4) and answer only on a
 * rooted connection that asked for a consumer; the workspace service has no
 * provenance to report.
 *
 * @public
 */
export type FileSystemBridgeService = Omit<FileSystemBridgeWorkspaceService, 'readFile' | 'writeFileChecked'> &
  Pick<RootedFileSystem, 'rename'> &
  Pick<ComposedView, 'provenance' | 'readdirWithStats'> & {
    readFile: FileSystemBridgeReadFile;
    writeFileChecked(input: Omit<CheckedFileWrite, 'signal'>): Promise<CheckedFileWriteResult>;
    archive(path: string, options?: ArchiveOptions): Promise<Blob>;
    contents(path: string, options?: ArchiveOptions): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
    search(query: string, options?: SearchOptions): Promise<FileStatEntry[]>;
    statTree(path: string): Promise<FileStatEntry[]>;
  };

type FileSystemBridgeCallName = keyof FileSystemBridgeService;
type FileSystemBridgeCallArgs<Name extends FileSystemBridgeCallName> = Name extends 'readFile'
  ? [path: string, options?: 'utf8' | { readonly encoding?: 'utf8'; readonly scope?: unknown }]
  : Parameters<FileSystemBridgeService[Name]>;
type FileSystemBridgeCallResult<Name extends FileSystemBridgeCallName> = Name extends 'readFile'
  ? string | Uint8Array<ArrayBuffer>
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
const projectIdSchema = projectManifestSchema.shape.id;

const durabilityClassValues = ['exclusive-append', 'stream-append', 'transactional-rewrite', 'ephemeral'] as const;
const durabilityClassSchema = z.enum(durabilityClassValues);
const providerCapabilitiesSchema: z.ZodType<ProviderCapabilities> = z.looseObject({
  persistent: z.boolean(),
  writable: z.boolean(),
  quotaBased: z.boolean(),
  // Version-1 peers sent only the three booleans. Current providers include durability.
  durability: durabilityClassSchema.optional(),
});

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
  return (
    (record.data['contentKind'] === 'binary' && record.data['lineCount'] === undefined) ||
    (record.data['contentKind'] === 'text' && finiteNumberSchema.safeParse(record.data['lineCount']).success)
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
  z.looseObject({ code: z.literal('manifest-invalid-json'), message: z.string() }),
  z.looseObject({ code: z.literal('manifest-too-large'), maxBytes: z.number() }),
  z.looseObject({
    code: z.literal('manifest-unknown-schema'),
    found: z.unknown().optional(),
    supported: z.literal(projectManifestSchemaUrl),
  }),
  z.looseObject({ code: z.literal('manifest-invalid'), issues: z.array(z.unknown()) }),
]) as z.ZodType<ProjectManifestParseIssue>;
const adoptableProjectManifestSchema = projectManifestSchema.omit({ id: true });
const projectDiscoveryEntrySchema: z.ZodType<ProjectDiscoveryEntry> = z.discriminatedUnion('status', [
  z.looseObject({ status: z.literal('valid'), manifest: projectManifestSchema, locator: projectLocatorSchema }),
  z.looseObject({ status: z.literal('duplicate-id'), manifest: projectManifestSchema, locator: projectLocatorSchema }),
  z.looseObject({ status: z.literal('route-blocked'), manifest: projectManifestSchema, locator: projectLocatorSchema }),
  z.looseObject({
    status: z.literal('adoption-required'),
    manifest: adoptableProjectManifestSchema,
    locator: projectLocatorSchema,
    issue: manifestIssueSchema,
  }),
  z.looseObject({ status: z.literal('invalid'), locator: projectLocatorSchema, issue: manifestIssueSchema }),
]);
const projectRootDiscoveryStatusSchema: z.ZodType<ProjectRootDiscoveryStatus> = z.discriminatedUnion('status', [
  z.looseObject({ status: z.literal('complete'), root: storageRootConfigSchema }),
  z.looseObject({ status: z.literal('inaccessible'), root: storageRootConfigSchema, reason: z.string() }),
]);

const watchRequestSchema: z.ZodType<WatchRequest> = z.looseObject({
  paths: z.array(z.string()),
  recursive: z.boolean().optional(),
  includes: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
});
const watchEventSchema: z.ZodType<WatchEvent> = z.discriminatedUnion('type', [
  z.looseObject({ type: z.literal('reset') }),
  z.looseObject({ type: z.literal('change'), path: z.string() }),
  z.looseObject({ type: z.literal('delete'), path: z.string() }),
  z.looseObject({ type: z.literal('rename'), oldPath: z.string(), newPath: z.string() }),
]);

const filesystemBackendSchema = z.enum(filesystemBackends);
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
const changeEventSchema: z.ZodType<ChangeEvent> = z.discriminatedUnion('type', [
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
    (node['contentKind'] === 'text' && finiteNumberSchema.safeParse(node['lineCount']).success)
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

type NoArguments = Parameters<() => void>;
const noArgs: z.ZodType<NoArguments> = z.tuple([]);
const oneStringArgument = z.tuple([z.string()]);
const twoStringArgs = z.tuple([z.string(), z.string()]);
/* `null` is admitted alongside `undefined` because msgpack decodes an absent
 * response payload as nil. Normalize it so every transport resolves void alike. */
const voidResult: z.ZodType<void> = z.union([z.undefined(), z.null()]).transform(() => undefined);
const booleanResult = z.boolean();
const recursiveOptionsSchema = z.looseObject({ recursive: z.boolean().optional() });
const scopedOptionsSchema = z.looseObject({ scope: workspaceScopeSchema.optional() });
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

const readFileOptionsSchema = z.union([
  z.literal('utf8'),
  z.looseObject({ encoding: z.literal('utf8').optional(), scope: workspaceScopeSchema.optional() }),
]);
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
const pendingProjectCommitResultSchema = z.discriminatedUnion('status', [
  z.looseObject({ status: z.enum(['committed', 'already-committed', 'unidentifiable-manifest']) }),
  z.looseObject({ status: z.literal('identity-mismatch'), actualProjectId: projectIdSchema }),
]);
const permanentDeleteInputSchema = z.looseObject({
  projectId: projectIdSchema,
  providerBasePath: projectDirectoryPathSchema,
  scope: storageRootConfigSchema,
});
const permanentDeleteResultSchema = z.discriminatedUnion('status', [
  z.looseObject({ status: z.enum(['deleted', 'absent', 'unidentifiable']) }),
  z.looseObject({ status: z.literal('identity-mismatch'), actualProjectId: projectIdSchema }),
]);
const searchOptionsSchema = z.looseObject({
  maxResults: z.number().optional(),
  includeDirectories: z.boolean().optional(),
});

const callSchemas = {
  readFile: {
    args: z.tuple([z.string(), readFileOptionsSchema.optional()]),
    result: z.union([z.string(), bytesSchema]),
  },
  writeFile: { args: z.tuple([z.string(), writePayloadSchema]), result: voidResult },
  writeFileChecked: { args: z.tuple([checkedWriteInputSchema]), result: checkedWriteResultSchema },
  appendFile: { args: z.tuple([z.string(), writePayloadSchema]), result: voidResult },
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
  getDirectoryStat: { args: oneStringArgument, result: fileStatEntriesSchema },
  getDirectoryContents: { args: oneStringArgument, result: directoryContentsSchema },
  duplicateFile: { args: twoStringArgs, result: voidResult },
  copyDirectory: { args: twoStringArgs, result: voidResult },
  /* Scope-only: a routed path is archived on its rooted view (`archive`), never here. */
  getZippedDirectory: {
    args: z.tuple([z.string(), z.looseObject({ scope: workspaceScopeSchema })]),
    result: z.instanceof(Blob),
  },
  mount: { args: z.tuple([z.string(), mountConfigSchema]), result: voidResult },
  unmount: { args: oneStringArgument, result: voidResult },
  configureProjectRoots: { args: z.tuple([projectRootConfigurationSchema]), result: voidResult },
  listProjectManifests: { args: noArgs, result: projectDiscoveryResultSchema },
  commitPendingProjectDirectory: {
    args: z.tuple([pendingProjectCommitInputSchema]),
    result: pendingProjectCommitResultSchema,
  },
  adoptProjectDirectory: { args: z.tuple([projectLocatorSchema]), result: projectManifestSchema },
  permanentlyDeleteProjectDirectory: {
    args: z.tuple([permanentDeleteInputSchema]),
    result: permanentDeleteResultSchema,
  },
  readShallowDirectory: { args: z.tuple([z.string(), scopedOptionsSchema.optional()]), result: fileTreeNodesSchema },
  disposeStorageRoot: { args: oneStringArgument, result: voidResult },
  readDirectory: { args: oneStringArgument, result: fileTreeNodesSchema },
  searchFiles: {
    args: z.tuple([z.string(), z.string(), searchOptionsSchema.optional()]),
    result: fileStatEntriesSchema,
  },
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
} satisfies FileSystemBridgeCallSchemas;

const broadcastValidator = z.looseObject({ event: z.literal('fileChanged'), data: changeEventSchema });

/** Exact runtime-validator inventory for the filesystem bridge domain. @public */
export const fileSystemBridgeSchemas = {
  hello: fileSystemBridgeHelloValidator,
  calls: callSchemas,
  listens: {
    watch: {
      args: watchRequestSchema,
      event: watchEventSchema,
    },
    broadcast: { event: broadcastValidator },
  },
} satisfies BridgeProtocolSchemas<FileSystemBridgeHello, WatchRequest, WatchEvent>;

type HelloInput =
  | { readonly state: 'ready'; readonly capabilities: ProviderCapabilities; readonly watchable: boolean }
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
