import type {
  ProviderCapabilities,
  FileSystemProvider,
  ProjectDiscoveryEntry,
  ProjectLocator,
  ProjectRootConfig,
  ProjectRootDiscoveryStatus,
  RootedFileSystem,
  StorageRootConfig,
  WatchEvent,
  WatchRequest,
  WorkspaceFileService,
  WorkspaceMutationError,
  WorkspaceScope,
} from '@taucad/filesystem';
import type { ChangeEvent, FileStat, FileStatEntry, ProjectManifestParseIssue } from '@taucad/types';
import { projectManifestSchema, projectManifestSchemaUrl } from '@taucad/types';
import type { BridgeProtocolSchemas } from '@taucad/rpc/bridge';
import type { WireValidationResult, WireValidator } from '@taucad/rpc';
import { assertRootedPath } from '@taucad/utils/path';

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

/** Rooted/runtime bridge calls, with signatures derived from the captured filesystem service. @public */
export type FileSystemBridgeRuntimeService = FileSystemProvider & Partial<Pick<RootedFileSystem, 'watch'>>;

type FileSystemBridgeReadFile = {
  (path: string, options: 'utf8' | { readonly encoding: 'utf8'; readonly scope?: WorkspaceScope }): Promise<string>;
  (path: string, options?: { readonly scope?: WorkspaceScope }): Promise<Uint8Array<ArrayBuffer>>;
};

/** Complete callable surface supported by a filesystem bridge proxy. @public */
export type FileSystemBridgeService = Omit<FileSystemBridgeWorkspaceService, 'readFile'> &
  Pick<RootedFileSystem, 'rename'> & {
    readFile: FileSystemBridgeReadFile;
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

const failure = (message: string, path: readonly PropertyKey[] = []): WireValidationResult<never> => ({
  success: false,
  error: { issues: [{ path, message }] },
});

const validator = <T>(check: (value: unknown) => boolean, message: string): WireValidator<T> => ({
  safeParse(value) {
    if (!check(value)) {
      return failure(message);
    }
    // This is the single domain trust handoff: each predicate above this cast
    // checks every bridge-owned known field while tolerating additive fields.
    return { success: true, data: value as T };
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isBytes = (value: unknown): value is Uint8Array<ArrayBuffer> => value instanceof Uint8Array;
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => isString(item));
const isOptionalBoolean = (value: unknown): boolean => value === undefined || isBoolean(value);
const isOptionalString = (value: unknown): boolean => value === undefined || isString(value);
const isRootedPath = (value: unknown): value is string => {
  if (!isString(value)) {
    return false;
  }
  try {
    return assertRootedPath(value) === value;
  } catch {
    return false;
  }
};
const isProjectDirectoryPath = (value: unknown): value is string =>
  isRootedPath(value) && value !== '' && !value.includes('/') && !value.startsWith('.');
const isProjectId = (value: unknown): value is string => projectManifestSchema.shape.id.safeParse(value).success;
const hasOnlyKnownTypedFields = (
  value: unknown,
  fields: Readonly<Record<string, (field: unknown) => boolean>>,
): value is Record<string, unknown> =>
  isRecord(value) && Object.entries(fields).every(([name, check]) => !(name in value) || check(value[name]));

const isCapabilities = (value: unknown): value is ProviderCapabilities =>
  isRecord(value) && isBoolean(value['persistent']) && isBoolean(value['writable']) && isBoolean(value['quotaBased']);

const isFileStat = (value: unknown): value is FileStat => {
  if (!isRecord(value) || (value['type'] !== 'file' && value['type'] !== 'dir')) {
    return false;
  }
  if (!isNumber(value['size']) || !isNumber(value['mtimeMs'])) {
    return false;
  }
  if (value['type'] === 'dir') {
    return true;
  }
  return (
    (value['contentKind'] === 'binary' && value['lineCount'] === undefined) ||
    (value['contentKind'] === 'text' && isNumber(value['lineCount']))
  );
};

const isFileStatEntry = (value: unknown): value is FileStatEntry => {
  if (!isRecord(value)) {
    return false;
  }
  const { path, name } = value;
  return isFileStat(value) && isString(path) && isString(name);
};

const mutationErrorCodes = new Set([
  'NAME_EXISTS',
  'INVALID_NAME',
  'READ_ONLY_MOUNT',
  'BUNDLED_TYPES_WORKSPACE',
  'MISSING_WORKSPACE_HANDLE',
  'NOT_FOUND',
  'OPERATION_FAILED',
]);

const isMutationError = (value: unknown): value is WorkspaceMutationError =>
  isRecord(value) &&
  isString(value['code']) &&
  mutationErrorCodes.has(value['code']) &&
  isString(value['path']) &&
  isString(value['message']) &&
  isOptionalString(value['target']);

const isWebAccessRoot = (value: Record<string, unknown>): boolean =>
  isRecord(value['directoryHandle']) && isString(value['workspaceId']);

const isStorageRootConfig = (value: unknown): value is StorageRootConfig => {
  if (!isRecord(value) || !isString(value['backend'])) {
    return false;
  }
  return value['backend'] === 'webaccess'
    ? isWebAccessRoot(value)
    : value['backend'] === 'indexeddb' || value['backend'] === 'opfs';
};

const isProjectRootConfig = (value: unknown): value is ProjectRootConfig => {
  if (
    !isRecord(value) ||
    !isProjectId(value['projectId']) ||
    !isProjectDirectoryPath(value['providerBasePath']) ||
    !isString(value['backend'])
  ) {
    return false;
  }
  if (value['backend'] === 'webaccess') {
    return isString(value['workspaceId']) && value['directoryHandle'] === undefined;
  }
  if (value['backend'] === 'memory') {
    return isString(value['storageRootKey']);
  }
  return value['backend'] === 'indexeddb' || value['backend'] === 'opfs';
};

const isProjectLocator = (value: unknown): value is ProjectLocator => {
  if (
    !isRecord(value) ||
    !isString(value['backend']) ||
    !isString(value['storageRootKey']) ||
    !isProjectDirectoryPath(value['relativeDirectory'])
  ) {
    return false;
  }
  if (value['backend'] === 'webaccess') {
    return isString(value['workspaceId']);
  }
  return value['backend'] === 'indexeddb' || value['backend'] === 'opfs';
};

const isScope = (value: unknown): boolean => {
  if (!isRecord(value) || !isString(value['backend'])) {
    return false;
  }
  if (value['backend'] === 'webaccess') {
    return isRecord(value['directoryHandle']) && isString(value['workspaceId']);
  }
  if (value['backend'] === 'memory') {
    return isString(value['storageRootKey']);
  }
  return value['backend'] === 'indexeddb' || value['backend'] === 'opfs';
};

const isManifestIssue = (value: unknown): value is ProjectManifestParseIssue => {
  if (!isRecord(value) || !isString(value['code'])) {
    return false;
  }
  switch (value['code']) {
    case 'manifest-unreadable':
    case 'manifest-invalid-json': {
      return isString(value['message']);
    }
    case 'manifest-too-large': {
      return isNumber(value['maxBytes']);
    }
    case 'manifest-unknown-schema': {
      return value['supported'] === projectManifestSchemaUrl;
    }
    case 'manifest-invalid': {
      return Array.isArray(value['issues']);
    }
    default: {
      return false;
    }
  }
};

const adoptableProjectManifestSchema = projectManifestSchema.omit({ id: true });
const isProjectManifest = (value: unknown): boolean => projectManifestSchema.safeParse(value).success;
const isAdoptableProjectManifest = (value: unknown): boolean => adoptableProjectManifestSchema.safeParse(value).success;

const isProjectDiscoveryEntry = (value: unknown): value is ProjectDiscoveryEntry => {
  if (!isRecord(value) || !isString(value['status']) || !isProjectLocator(value['locator'])) {
    return false;
  }
  switch (value['status']) {
    case 'valid':
    case 'duplicate-id':
    case 'route-blocked': {
      return isProjectManifest(value['manifest']);
    }
    case 'adoption-required': {
      return isAdoptableProjectManifest(value['manifest']) && isManifestIssue(value['issue']);
    }
    case 'invalid': {
      return isManifestIssue(value['issue']);
    }
    default: {
      return false;
    }
  }
};

const isProjectRootDiscoveryStatus = (value: unknown): value is ProjectRootDiscoveryStatus => {
  if (!isRecord(value) || !isString(value['status']) || !isStorageRootConfig(value['root'])) {
    return false;
  }
  return value['status'] === 'complete' || (value['status'] === 'inaccessible' && isString(value['reason']));
};

const isWatchRequest = (value: unknown): value is WatchRequest =>
  isRecord(value) &&
  isStringArray(value['paths']) &&
  isOptionalBoolean(value['recursive']) &&
  (value['includes'] === undefined || isStringArray(value['includes'])) &&
  (value['excludes'] === undefined || isStringArray(value['excludes']));

const isWatchEvent = (value: unknown): value is WatchEvent => {
  if (!isRecord(value) || !isString(value['type'])) {
    return false;
  }
  if (value['type'] === 'reset') {
    return true;
  }
  if (value['type'] === 'change' || value['type'] === 'delete') {
    return isString(value['path']);
  }
  return value['type'] === 'rename' && isString(value['oldPath']) && isString(value['newPath']);
};

const changeEventTypes = new Set([
  'fileWritten',
  'fileDeleted',
  'fileRenamed',
  'fileCopied',
  'directoryCreated',
  'directoryDeleted',
  'directoryRenamed',
  'directoryCopied',
  'directoryChanged',
  'backendChanged',
]);
const filesystemBackends = new Set(['indexeddb', 'opfs', 'webaccess', 'memory']);
const isChangeEventStat = (value: unknown): boolean =>
  isRecord(value) &&
  (value['type'] === 'file' || value['type'] === 'dir') &&
  isNumber(value['size']) &&
  isNumber(value['mtimeMs']);
const isChangeEvent = (value: unknown): value is ChangeEvent => {
  if (
    !isRecord(value) ||
    !isString(value['type']) ||
    !changeEventTypes.has(value['type']) ||
    !isString(value['backend']) ||
    !filesystemBackends.has(value['backend'])
  ) {
    return false;
  }
  const targetIsValid = value['target'] === undefined || isChangeEventStat(value['target']);
  switch (value['type']) {
    case 'backendChanged': {
      return true;
    }
    case 'fileRenamed':
    case 'directoryRenamed': {
      return isString(value['oldPath']) && isString(value['newPath']) && targetIsValid;
    }
    case 'fileCopied':
    case 'directoryCopied': {
      return isString(value['sourcePath']) && isString(value['targetPath']) && targetIsValid;
    }
    default: {
      return isString(value['path']) && targetIsValid;
    }
  }
};

const isFileTreeNode = (value: unknown): boolean => {
  if (
    !isRecord(value) ||
    !isString(value['id']) ||
    !isString(value['name']) ||
    !isNumber(value['size']) ||
    !isNumber(value['mtimeMs'])
  ) {
    return false;
  }
  if (value['children'] !== undefined) {
    return Array.isArray(value['children']) && value['children'].every((child) => isFileTreeNode(child));
  }
  return (
    (value['contentKind'] === 'binary' && value['lineCount'] === undefined) ||
    (value['contentKind'] === 'text' && isNumber(value['lineCount']))
  );
};

const args = <T extends unknown[]>(check: (items: unknown[]) => boolean, description: string): WireValidator<T> =>
  validator<T>((value) => Array.isArray(value) && check(value), description);
const result = <T>(check: (value: unknown) => boolean, description: string): WireValidator<T> =>
  validator<T>(check, description);

type NoArguments = Parameters<() => void>;
const noArgs = args<NoArguments>((items) => items.length === 0, 'Expected no arguments');
const oneStringArgument = args<[string]>((items) => items.length === 1 && isString(items[0]), 'Expected one string');
const twoStringArgs = args<[string, string]>(
  (items) => items.length === 2 && isString(items[0]) && isString(items[1]),
  'Expected two strings',
);
/* `null` is admitted alongside `undefined` because a binary codec (msgpack)
 * encodes an absent response payload as nil and decodes it back as `null`;
 * the accepted value is normalised to `undefined` so a void call resolves
 * identically on every transport. */
const voidResult: WireValidator<void> = {
  safeParse: (value) =>
    value === undefined || value === null ? { success: true, data: undefined } : failure('Expected no result'),
};
const booleanResult = result<boolean>(isBoolean, 'Expected a boolean');
const statResult = result<FileStat>(isFileStat, 'Expected a filesystem stat');

const fileSystemBridgeHelloValidator: WireValidator<FileSystemBridgeHello> = {
  safeParse(value) {
    const receivedVersion = isRecord(value) ? value['v'] : undefined;
    if (receivedVersion !== fileSystemBridgeProtocolVersion) {
      throw new FileSystemBridgeProtocolVersionError(receivedVersion);
    }
    if (!isRecord(value) || !isString(value['state']) || !isBoolean(value['watchable'])) {
      return failure('Expected a filesystem bridge hello');
    }
    if (value['state'] === 'ready' && isCapabilities(value['capabilities'])) {
      return { success: true, data: value as FileSystemBridgeHello };
    }
    if (value['state'] === 'workspace' && value['capabilities'] === null) {
      return { success: true, data: value as FileSystemBridgeHello };
    }
    if (
      value['state'] === 'unavailable' &&
      value['capabilities'] === null &&
      !value['watchable'] &&
      isRecord(value['error']) &&
      value['error']['code'] === 'ROOT_UNAVAILABLE' &&
      isString(value['error']['message'])
    ) {
      return { success: true, data: value as FileSystemBridgeHello };
    }
    return failure('Expected a valid filesystem bridge availability state');
  },
};

const callSchemas = {
  readFile: {
    args: args<FileSystemBridgeCallArgs<'readFile'>>(
      (items) =>
        (items.length === 1 || items.length === 2) &&
        isString(items[0]) &&
        (items[1] === undefined ||
          items[1] === 'utf8' ||
          hasOnlyKnownTypedFields(items[1], {
            encoding: (value) => value === undefined || value === 'utf8',
            scope: (value) => value === undefined || isScope(value),
          })),
      'Expected readFile(path, options?)',
    ),
    result: result<FileSystemBridgeCallResult<'readFile'>>(
      (value) => isString(value) || isBytes(value),
      'Expected file bytes or UTF-8 text',
    ),
  },
  writeFile: {
    args: args<FileSystemBridgeCallArgs<'writeFile'>>(
      (items) => items.length === 2 && isString(items[0]) && (isString(items[1]) || isBytes(items[1])),
      'Expected writeFile(path, bytesOrText)',
    ),
    result: voidResult,
  },
  writeFiles: {
    args: args<FileSystemBridgeCallArgs<'writeFiles'>>(
      (items) =>
        items.length === 1 &&
        isRecord(items[0]) &&
        Object.values(items[0]).every(
          (entry) => isRecord(entry) && (isBytes(entry['content']) || isString(entry['content'])),
        ),
      'Expected a path-to-binary-file map',
    ),
    result: voidResult,
  },
  mkdir: {
    args: args<FileSystemBridgeCallArgs<'mkdir'>>(
      (items) =>
        (items.length === 1 || items.length === 2) &&
        isString(items[0]) &&
        (items[1] === undefined || hasOnlyKnownTypedFields(items[1], { recursive: isOptionalBoolean })),
      'Expected mkdir(path, options?)',
    ),
    result: voidResult,
  },
  readdir: {
    args: oneStringArgument,
    result: result<string[]>(isStringArray, 'Expected an array of names'),
  },
  stat: { args: oneStringArgument, result: statResult },
  lstat: { args: oneStringArgument, result: statResult },
  move: { args: twoStringArgs, result: statResult },
  canMove: {
    args: twoStringArgs,
    result: result<true | WorkspaceMutationError>(
      (value) => value === true || isMutationError(value),
      'Expected true or a workspace mutation error',
    ),
  },
  canRename: {
    args: twoStringArgs,
    result: result<true | WorkspaceMutationError>(
      (value) => value === true || isMutationError(value),
      'Expected true or a workspace mutation error',
    ),
  },
  canCreate: {
    args: args<FileSystemBridgeCallArgs<'canCreate'>>(
      (items) => items.length === 2 && isString(items[0]) && (items[1] === 'file' || items[1] === 'directory'),
      "Expected canCreate(path, 'file' | 'directory')",
    ),
    result: result<true | WorkspaceMutationError>(
      (value) => value === true || isMutationError(value),
      'Expected true or a workspace mutation error',
    ),
  },
  canDelete: {
    args: oneStringArgument,
    result: result<true | WorkspaceMutationError>(
      (value) => value === true || isMutationError(value),
      'Expected true or a workspace mutation error',
    ),
  },
  bulkMove: {
    args: args<FileSystemBridgeCallArgs<'bulkMove'>>(
      (items) =>
        items.length === 1 &&
        Array.isArray(items[0]) &&
        items[0].every((edit) => isRecord(edit) && isString(edit['source']) && isString(edit['target'])),
      'Expected an array of move edits',
    ),
    result: result<FileSystemBridgeCallResult<'bulkMove'>>(
      (value) =>
        isRecord(value) &&
        Array.isArray(value['moved']) &&
        value['moved'].every(
          (entry) =>
            isRecord(entry) &&
            isRecord(entry['edit']) &&
            isString(entry['edit']['source']) &&
            isString(entry['edit']['target']) &&
            isFileStat(entry['stat']),
        ) &&
        Array.isArray(value['failed']) &&
        value['failed'].every(
          (entry) =>
            isRecord(entry) &&
            isRecord(entry['edit']) &&
            isString(entry['edit']['source']) &&
            isString(entry['edit']['target']) &&
            isMutationError(entry['error']),
        ),
      'Expected a bulk-move result',
    ),
  },
  unlink: { args: oneStringArgument, result: voidResult },
  rmdir: {
    args: args<FileSystemBridgeCallArgs<'rmdir'>>(
      (items) =>
        (items.length === 1 || items.length === 2) &&
        isString(items[0]) &&
        (items[1] === undefined || hasOnlyKnownTypedFields(items[1], { recursive: isOptionalBoolean })),
      'Expected rmdir(path, options?)',
    ),
    result: voidResult,
  },
  exists: { args: oneStringArgument, result: booleanResult },
  getDirectoryStat: {
    args: oneStringArgument,
    result: result<FileStatEntry[]>(
      (value) => Array.isArray(value) && value.every((entry) => isFileStatEntry(entry)),
      'Expected filesystem stat entries',
    ),
  },
  getDirectoryContents: {
    args: oneStringArgument,
    result: result<Record<string, Uint8Array<ArrayBuffer>>>(
      (value) => isRecord(value) && Object.values(value).every((entry) => isBytes(entry)),
      'Expected a path-to-bytes map',
    ),
  },
  duplicateFile: { args: twoStringArgs, result: voidResult },
  copyDirectory: { args: twoStringArgs, result: voidResult },
  getZippedDirectory: {
    args: args<FileSystemBridgeCallArgs<'getZippedDirectory'>>(
      (items) =>
        (items.length === 1 || items.length === 2) &&
        isString(items[0]) &&
        (items[1] === undefined ||
          hasOnlyKnownTypedFields(items[1], { scope: (value) => value === undefined || isScope(value) })),
      'Expected getZippedDirectory(path, options?)',
    ),
    result: result<Blob>((value) => value instanceof Blob, 'Expected a Blob'),
  },
  mount: {
    args: args<FileSystemBridgeCallArgs<'mount'>>(
      (items) => items.length === 2 && isString(items[0]) && isScope(items[1]),
      'Expected mount(prefix, config)',
    ),
    result: voidResult,
  },
  unmount: { args: oneStringArgument, result: voidResult },
  configureProjectRoots: {
    args: args<FileSystemBridgeCallArgs<'configureProjectRoots'>>(
      (items) =>
        items.length === 1 &&
        isRecord(items[0]) &&
        Array.isArray(items[0]['projects']) &&
        items[0]['projects'].every((project) => isProjectRootConfig(project)) &&
        Array.isArray(items[0]['roots']) &&
        items[0]['roots'].every((root) => isStorageRootConfig(root)),
      'Expected a project-root configuration',
    ),
    result: voidResult,
  },
  listProjectManifests: {
    args: noArgs,
    result: result<FileSystemBridgeCallResult<'listProjectManifests'>>(
      (value) =>
        isRecord(value) &&
        Array.isArray(value['entries']) &&
        value['entries'].every((entry) => isProjectDiscoveryEntry(entry)) &&
        Array.isArray(value['roots']) &&
        value['roots'].every((root) => isProjectRootDiscoveryStatus(root)),
      'Expected a project-discovery result',
    ),
  },
  commitPendingProjectDirectory: {
    args: args<FileSystemBridgeCallArgs<'commitPendingProjectDirectory'>>(
      (items) =>
        items.length === 1 &&
        isRecord(items[0]) &&
        isProjectDirectoryPath(items[0]['providerBasePath']) &&
        isStorageRootConfig(items[0]['scope']) &&
        isRecord(items[0]['files']) &&
        Object.keys(items[0]['files']).every((path) => path !== '' && isRootedPath(path)) &&
        Object.values(items[0]['files']).every((entry) => isRecord(entry) && isBytes(entry['content'])) &&
        isBytes(items[0]['manifest']),
      'Expected a pending-project commit input',
    ),
    result: result<FileSystemBridgeCallResult<'commitPendingProjectDirectory'>>(
      (value) =>
        isRecord(value) &&
        (value['status'] === 'committed' ||
          value['status'] === 'already-committed' ||
          value['status'] === 'unidentifiable-manifest' ||
          (value['status'] === 'identity-mismatch' && isProjectId(value['actualProjectId']))),
      'Expected a pending-project commit result',
    ),
  },
  adoptProjectDirectory: {
    args: args<FileSystemBridgeCallArgs<'adoptProjectDirectory'>>(
      (items) => items.length === 1 && isProjectLocator(items[0]),
      'Expected a project locator',
    ),
    result: result<FileSystemBridgeCallResult<'adoptProjectDirectory'>>(
      isProjectManifest,
      'Expected a project manifest',
    ),
  },
  permanentlyDeleteProjectDirectory: {
    args: args<FileSystemBridgeCallArgs<'permanentlyDeleteProjectDirectory'>>(
      (items) =>
        items.length === 1 &&
        isRecord(items[0]) &&
        isProjectId(items[0]['projectId']) &&
        isProjectDirectoryPath(items[0]['providerBasePath']) &&
        isStorageRootConfig(items[0]['scope']),
      'Expected a permanent-delete input',
    ),
    result: result<FileSystemBridgeCallResult<'permanentlyDeleteProjectDirectory'>>(
      (value) =>
        isRecord(value) &&
        (value['status'] === 'deleted' ||
          value['status'] === 'absent' ||
          value['status'] === 'unidentifiable' ||
          (value['status'] === 'identity-mismatch' && isProjectId(value['actualProjectId']))),
      'Expected a permanent-delete result',
    ),
  },
  readShallowDirectory: {
    args: args<FileSystemBridgeCallArgs<'readShallowDirectory'>>(
      (items) =>
        (items.length === 1 || items.length === 2) &&
        isString(items[0]) &&
        (items[1] === undefined ||
          hasOnlyKnownTypedFields(items[1], { scope: (value) => value === undefined || isScope(value) })),
      'Expected readShallowDirectory(path, options?)',
    ),
    result: result<FileSystemBridgeCallResult<'readShallowDirectory'>>(
      (value) => Array.isArray(value) && value.every((node) => isFileTreeNode(node)),
      'Expected file-tree nodes',
    ),
  },
  disposeStorageRoot: { args: oneStringArgument, result: voidResult },
  readDirectory: {
    args: oneStringArgument,
    result: result<FileSystemBridgeCallResult<'readDirectory'>>(
      (value) => Array.isArray(value) && value.every((node) => isFileTreeNode(node)),
      'Expected file-tree nodes',
    ),
  },
  searchFiles: {
    args: args<FileSystemBridgeCallArgs<'searchFiles'>>(
      (items) =>
        (items.length === 2 || items.length === 3) &&
        isString(items[0]) &&
        isString(items[1]) &&
        (items[2] === undefined ||
          hasOnlyKnownTypedFields(items[2], {
            maxResults: (value) => value === undefined || isNumber(value),
            includeDirectories: isOptionalBoolean,
          })),
      'Expected searchFiles(root, query, options?)',
    ),
    result: result<FileStatEntry[]>(
      (value) => Array.isArray(value) && value.every((entry) => isFileStatEntry(entry)),
      'Expected filesystem stat entries',
    ),
  },
  pollExternalChanges: {
    args: args<FileSystemBridgeCallArgs<'pollExternalChanges'>>(
      (items) => (items.length === 0 || items.length === 1) && isOptionalString(items[0]),
      'Expected pollExternalChanges(root?)',
    ),
    result: booleanResult,
  },
  rename: { args: twoStringArgs, result: voidResult },
} satisfies FileSystemBridgeCallSchemas;

const broadcastValidator = validator<{ readonly event: 'fileChanged'; readonly data: ChangeEvent }>(
  (value) => isRecord(value) && value['event'] === 'fileChanged' && isChangeEvent(value['data']),
  'Expected a filesystem change broadcast',
);

/** Exact runtime-validator inventory for the filesystem bridge domain. @public */
export const fileSystemBridgeSchemas = {
  hello: fileSystemBridgeHelloValidator,
  calls: callSchemas,
  listens: {
    watch: {
      args: validator<WatchRequest>(isWatchRequest, 'Expected a filesystem watch request'),
      event: validator<WatchEvent>(isWatchEvent, 'Expected a filesystem watch event'),
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
