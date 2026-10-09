import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';

/** Physical authority selected by the running application's persisted project configuration. */
export type ProjectionWriterProject = {
  readonly projectId: string;
  readonly backend: 'opfs' | 'indexeddb';
  readonly providerBasePath: string;
  readonly databasePrefix: string;
};

/** Evidence from the actual mutation pipeline, rather than a fabricated cross-tab notification. */
export type ProjectionWriterReceipt = {
  readonly path: string;
  readonly storageRootKey: string;
  readonly providerBasePath: string;
  readonly events: readonly string[];
};

/**
 * Write through an independently composed production filesystem authority in the target document's origin.
 *
 * @param project - Exact persisted provider identity and database namespace.
 * @param path - Project-relative file path.
 * @param content - Replacement text or bytes, or undefined to delete the file.
 * @returns Physical authority and real local mutation event evidence.
 */
export const writeProjectionFile = async (
  project: ProjectionWriterProject,
  path: string,
  content?: string | Uint8Array<ArrayBuffer>,
): Promise<ProjectionWriterReceipt> => {
  const registry = new ProviderRegistry({ databasePrefix: project.databasePrefix });
  const mounts = new MountTable();
  const eventBus = new ChangeEventBus();
  const events: string[] = [];
  const unsubscribe = eventBus.subscribe((event) => events.push(event.type));
  const service = new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable: mounts,
  });
  try {
    await service.configureProjectRoots({ projects: [project], roots: [] });
    const mount = mounts.listMounts().find((candidate) => candidate.routeId === project.projectId);
    if (!mount?.storageRootKey) {
      throw new Error('The configured project has no resolved physical authority.');
    }
    const rooted = service.createRootedFileSystem(mount.prefix);
    await (content === undefined
      ? rooted.unlink(path)
      : rooted.writeFile(path, typeof content === 'string' ? content : new Uint8Array(content)));
    return {
      path,
      storageRootKey: mount.storageRootKey,
      providerBasePath: mount.providerBasePath,
      events,
    };
  } finally {
    unsubscribe();
    service.dispose();
  }
};

/** Home's actual pinned physical provider; Home is not a configured project route. */
export type ProjectionWriterHome = {
  readonly backend: 'opfs' | 'indexeddb';
  readonly databasePrefix: string;
};

/** Home mutation proof, including the engine pin and provider namespace used by the target origin. */
export type ProjectionHomeWriterReceipt = ProjectionWriterReceipt & {
  readonly backend: ProjectionWriterHome['backend'];
  readonly homePin: ProjectionWriterHome['backend'];
  readonly databasePrefix: string;
};

/**
 * Mutate Home through the same authored root composition as the production file-manager worker.
 * @param home - Persisted Home engine pin and actual provider namespace.
 * @param path - Canonical Home-relative path.
 * @param content - Replacement text or bytes, or undefined to unlink.
 * @returns Actual rooted mutation and cross-tab event identity.
 */
export const writeProjectionHomeFile = async (
  home: ProjectionWriterHome,
  path: string,
  content?: string | Uint8Array<ArrayBuffer>,
): Promise<ProjectionHomeWriterReceipt> => {
  const registry = new ProviderRegistry({ databasePrefix: home.databasePrefix });
  const mounts = new MountTable();
  const scope = { backend: home.backend };
  const provider = await registry.getProvider(scope);
  const storageRootKey = registry.resolveStorageRootKey(scope);
  mounts.mount('/', provider, { backend: home.backend, storageRootKey, class: 'authored' });
  const eventBus = new ChangeEventBus();
  const events: string[] = [];
  const unsubscribe = eventBus.subscribe((event) => events.push(event.type));
  const service = new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable: mounts,
  });
  try {
    const rooted = service.createRootedFileSystem('/');
    await (content === undefined
      ? rooted.unlink(path)
      : rooted.writeFile(path, typeof content === 'string' ? content : new Uint8Array(content)));
    return {
      path,
      storageRootKey,
      providerBasePath: '',
      events,
      backend: home.backend,
      homePin: home.backend,
      databasePrefix: home.databasePrefix,
    };
  } finally {
    unsubscribe();
    service.dispose();
  }
};

/** Immutable binary fixture closure; hashes cover the exact bytes, including revision objects. */
export type ProjectionClosure = {
  readonly version: 2;
  readonly project: ProjectionWriterProject;
  readonly directories: readonly string[];
  readonly files: readonly ProjectionClosureFile[];
};

/** Binary closure file with independently bounded transport chunks; no text conversion. */
export type ProjectionClosureFile = {
  readonly path: string;
  readonly byteLength: number;
  readonly base64Chunks: readonly string[];
  readonly sha256: string;
};

/** Decode exact raw bytes, rejecting malformed or oversized encoded chunks. */
export const decodeProjectionFile = (file: ProjectionClosureFile): Uint8Array<ArrayBuffer> => {
  if (!Number.isSafeInteger(file.byteLength) || file.byteLength < 0) {
    throw new Error('Invalid projection file byte length.');
  }
  const bytes = new Uint8Array(file.byteLength);
  let offset = 0;
  for (const chunk of file.base64Chunks) {
    if (chunk.length > 65_536 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(chunk)) {
      throw new Error('Invalid or oversized projection byte chunk.');
    }
    const decoded = base64ToUint8Array(chunk);
    if (offset + decoded.byteLength > bytes.byteLength) {
      throw new Error('Projection chunks exceed byte length.');
    }
    bytes.set(decoded, offset);
    offset += decoded.byteLength;
  }
  if (offset !== bytes.byteLength) {
    throw new Error('Projection chunks do not fill byte length.');
  }
  return bytes;
};

/** Encode whole bytes in bounded raw-byte slices, preserving arbitrary UTF8/binary boundaries. */
export const encodeProjectionFile = async (
  path: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<ProjectionClosureFile> => {
  const base64Chunks: string[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += 49_152) {
    base64Chunks.push(uint8ArrayToBase64(bytes.subarray(offset, offset + 49_152)));
  }
  return { path, byteLength: bytes.byteLength, base64Chunks, sha256: await digestBytes(bytes) };
};

const digestBytes = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

/** Validate all fixture bytes and rooted paths before any import writes. */
export const validateProjectionClosure = async (closure: ProjectionClosure): Promise<void> => {
  const version: unknown = Reflect.get(closure, 'version');
  if (version !== 2 || closure.files.length === 0) {
    throw new Error('Unsupported or empty projection closure.');
  }
  const paths = new Set<string>();
  for (const path of closure.directories) {
    if (
      path.startsWith('/') ||
      path.split('/').some((part) => part === '' || part === '.' || part === '..' || part.endsWith('.lock')) ||
      paths.has(path)
    ) {
      throw new Error(`Invalid or duplicate rooted fixture path ${path}.`);
    }
    paths.add(path);
  }
  for (const file of closure.files) {
    if (
      file.path.startsWith('/') ||
      file.path.split('/').some((part) => part === '' || part === '.' || part === '..' || part.endsWith('.lock')) ||
      paths.has(file.path)
    ) {
      throw new Error(`Invalid or duplicate rooted fixture path ${file.path}.`);
    }
    paths.add(file.path);
    // oxlint-disable-next-line no-await-in-loop -- One decoded file at a time bounds fixture import validation memory.
    if ((await digestBytes(decodeProjectionFile(file))) !== file.sha256) {
      throw new Error(`Projection fixture byte proof failed for ${file.path}.`);
    }
  }
  const manifest = closure.files.find((file) => file.path === 'tau.json');
  if (
    !manifest ||
    (JSON.parse(new TextDecoder().decode(decodeProjectionFile(manifest))) as { id?: string }).id !==
      closure.project.projectId
  ) {
    throw new Error('Projection closure manifest identity does not match its rooted authority.');
  }
};

/** Export every physical project file through the same production rooted filesystem authority. */
export const exportProjectionClosure = async (
  project: ProjectionWriterProject,
  paths?: readonly string[],
): Promise<ProjectionClosure> => {
  const registry = new ProviderRegistry({ databasePrefix: project.databasePrefix });
  const mounts = new MountTable();
  const service = new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable: mounts,
  });
  try {
    await service.configureProjectRoots({ projects: [project], roots: [] });
    const mount = mounts.listMounts().find((candidate) => candidate.routeId === project.projectId);
    if (!mount?.storageRootKey) {
      throw new Error('Projection closure has no resolved physical authority.');
    }
    const rooted = service.createRootedFileSystem(mount.prefix);
    const directories: string[] = [];
    const walk = async (directory: string): Promise<ProjectionClosure['files']> => {
      const names = await rooted.readdir(directory);
      const files: ProjectionClosureFile[] = [];
      for (const name of names.filter((candidate) => !candidate.endsWith('.lock'))) {
        const path = directory ? `${directory}/${name}` : name;
        // oxlint-disable-next-line no-await-in-loop -- Sequential physical reads bound the fixture to one decoded file at a time.
        const stat = await rooted.stat(path);
        if (stat.type === 'dir') {
          directories.push(path);
          // oxlint-disable-next-line no-await-in-loop -- Recurse in order without concurrent decoded directory closures.
          files.push(...(await walk(path)));
        } else if (paths === undefined || path === 'tau.json' || paths.includes(path)) {
          // oxlint-disable-next-line no-await-in-loop -- Never fan out acquisition of large fixture sources.
          const bytes = await rooted.readFile(path);
          // oxlint-disable-next-line no-await-in-loop -- Hash and encode before acquiring the next physical file.
          files.push(await encodeProjectionFile(path, bytes));
        }
      }
      return files;
    };
    const files = [...(await walk(''))].sort((left, right) => left.path.localeCompare(right.path));
    const closure: ProjectionClosure = {
      version: 2,
      project,
      directories: directories.sort(),
      files,
    };
    await validateProjectionClosure(closure);
    return closure;
  } finally {
    service.dispose();
  }
};

/** Import exact binary bytes into a fresh root, then reacquire and prove the complete physical closure. */
export const importProjectionClosure = async (closure: ProjectionClosure): Promise<ProjectionClosure> => {
  await validateProjectionClosure(closure);
  // This is a fixture transaction, not an active appender mutation or overwrite of an unrelated project.
  const registry = new ProviderRegistry({ databasePrefix: closure.project.databasePrefix });
  const mounts = new MountTable();
  const service = new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable: mounts,
  });
  try {
    await service.configureProjectRoots({ projects: [closure.project], roots: [] });
    const mount = mounts.listMounts().find((candidate) => candidate.routeId === closure.project.projectId);
    if (!mount?.storageRootKey) {
      throw new Error('Projection import has no resolved physical authority.');
    }
    const rooted = service.createRootedFileSystem(mount.prefix);
    if (await rooted.exists('tau.json')) {
      throw new Error('Projection fixture import requires a fresh absent project root.');
    }
    await Promise.all(closure.directories.map(async (path) => rooted.mkdir(path, { recursive: true })));
    for (const file of closure.files) {
      // oxlint-disable-next-line no-await-in-loop -- Write one decoded file at a time through actual rooted authority.
      await rooted.writeFile(file.path, decodeProjectionFile(file));
    }
  } finally {
    service.dispose();
  }
  const actual = await exportProjectionClosure(closure.project);
  if (
    JSON.stringify(actual.directories) !== JSON.stringify(closure.directories) ||
    actual.files.length !== closure.files.length ||
    actual.files.some((file, index) => {
      const expected = closure.files.at(index);
      return (
        expected === undefined ||
        file.path !== expected.path ||
        file.byteLength !== expected.byteLength ||
        file.sha256 !== expected.sha256
      );
    })
  ) {
    throw new Error('Projection fixture import changed its complete rooted byte closure.');
  }
  return actual;
};
