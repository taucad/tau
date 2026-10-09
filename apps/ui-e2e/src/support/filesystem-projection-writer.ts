// oxlint-disable-next-line no-restricted-imports -- Shared harness type must resolve beside this module in both browser and native test projects.
import type { ProjectionDirectoryReceipt } from './projection-fixture-validation.ts';
import { parseEventLog, parseLogEvent, reduceEventLog } from '@taucad/agent-host';
import type { AgentLogEvent } from '@taucad/agent-host';
import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import {
  createFileSystemBridge,
  createFileSystemBridgeProxy,
  openFileSystemBridge,
  waitForWorkerReady,
} from '@taucad/fs-bridge';
import type { FileSystemBridgeRootedProxy, FileSystemBridgeWorkspaceProxy } from '@taucad/fs-bridge';

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

/**
 * Expand one authentic finalized turn without retaining generated historical rows.
 * Revision and physical project identities remain bound to the original closure.
 *
 * @param template - The complete authentic one-turn log.
 * @param turns - Positive whole number of accumulated turns.
 * @returns Canonically parsed rows in physical append order.
 */
export function* iterateProjectionHistory(template: string, turns: number): Generator<AgentLogEvent> {
  if (!Number.isSafeInteger(turns) || turns < 1) {
    throw new Error('Projection turn count must be a positive safe integer.');
  }
  const source = parseEventLog(template);
  const sourceMessages = reduceEventLog(source);
  if (source.filter((row) => row.type === 'turn.history-projection-committed').length !== 1) {
    throw new Error('A benchmark template must contain exactly one complete committed turn.');
  }
  const identities = new Set<string>();
  const protectedIdentities = new Set<string>();
  const identityFields = new Set([
    'id',
    'runId',
    'messageId',
    'userMessageId',
    'requestMessageId',
    'commandId',
    'attemptId',
    'operationId',
    'toolCallId',
    'leaseId',
    'turnId',
    'requestId',
    'invocationId',
    'interactionId',
    'bindingId',
    'receiptId',
    'stepId',
    'parentMessageId',
    'responseId',
  ]);
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) {
        collect(child);
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value)) {
        if (
          ['model', 'provider', 'project', 'checkout', 'host'].includes(key) &&
          typeof child === 'object' &&
          child !== null &&
          'id' in child &&
          typeof child.id === 'string'
        ) {
          const identity = String(child.id);
          protectedIdentities.add(identity);
        }
        if (
          typeof child === 'string' &&
          (/revisionId$/iu.test(key) ||
            ['projectId', 'chatId', 'checkoutId', 'modelId', 'providerId', 'hostId'].includes(key))
        ) {
          protectedIdentities.add(child);
        }
        if (identityFields.has(key) && typeof child === 'string') {
          identities.add(child);
        }
        collect(child);
      }
    }
  };
  for (const row of source) {
    collect(row);
  }
  for (const protectedIdentity of protectedIdentities) {
    identities.delete(protectedIdentity);
  }
  let sequence = 0;
  const retained: string[] = [];
  for (let turn = 0; turn < turns; turn += 1) {
    const replacements = new Map([...identities].map((id) => [id, `${id}:projection:${turn}`]));
    const rewrite = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return replacements.get(value) ?? value;
      }
      if (Array.isArray(value)) {
        return value.map((child) => rewrite(child));
      }
      if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]));
      }
      return value;
    };
    for (const row of source) {
      const rewritten = rewrite(row) as Record<string, unknown>;
      rewritten['leaderEpoch'] = source[0]!.leaderEpoch;
      rewritten['epoch'] = source[0]!.epoch;
      rewritten['sequence'] = sequence++;
      if (row.type === 'turn.history-projection-committed') {
        rewritten['retainedMessageIds'] = [...retained];
        const message = rewritten['message'] as { content: unknown };
        const marker = `Fixture turn ${turn + 1} of ${turns}.`;
        message.content =
          typeof message.content === 'string'
            ? `${message.content} ${marker}`
            : [...(message.content as unknown[]), { type: 'text', text: marker }];
      }
      yield parseLogEvent(rewritten);
    }
    retained.push(...sourceMessages.map((message) => replacements.get(message.id) ?? message.id));
  }
}

/* oxlint-disable no-await-in-loop -- The import bounds memory and preserves append/range order by completing each physical operation before the next. */
/** Import one authenticated raw directory receipt through the actual rooted provider, one bounded chunk at a time. */
export const openProjectionDirectoryImport = async (
  receipt: ProjectionDirectoryReceipt,
): Promise<{
  readonly workerUrl: string;
  append(path: string, position: number, base64: string): Promise<void>;
  finish(): Promise<{ files: number; storageRootKey: string }>;
  dispose(): void;
}> => {
  const paths = new Set<string>();
  for (const path of [...receipt.directories, ...receipt.files.map((file) => file.path)]) {
    if (
      path.includes('\\') ||
      /^[a-z]:/iu.test(path) ||
      path.startsWith('/') ||
      path.split('/').some((part) => part === '' || part === '.' || part === '..' || part.endsWith('.lock')) ||
      paths.has(path.toLowerCase())
    ) {
      throw new Error('Invalid or duplicate raw rooted fixture path.');
    }
    paths.add(path.toLowerCase());
  }
  if (receipt.project.backend !== 'opfs') {
    throw new Error('Streamed projection import requires the OPFS worker append path.');
  }
  const workerModuleUrl = new URL('filesystem-projection-import.worker.ts', import.meta.url).href;
  let bootstrapUrl: string | undefined;
  let worker: Worker | undefined;
  const admission = new AbortController();
  const onWorkerError = () => {
    admission.abort(new Error('Projection import worker failed.'));
  };
  let workspace: FileSystemBridgeWorkspaceProxy | undefined;
  let writer: FileSystemBridgeRootedProxy | undefined;
  const registry = new ProviderRegistry({ databasePrefix: receipt.project.databasePrefix });
  const mounts = new MountTable();
  const service = new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable: mounts,
  });
  let disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    admission.abort();
    writer?.dispose();
    workspace?.dispose();
    worker?.removeEventListener('error', onWorkerError);
    worker?.removeEventListener('messageerror', onWorkerError);
    worker?.terminate();
    if (bootstrapUrl !== undefined) {
      URL.revokeObjectURL(bootstrapUrl);
    }
    service.dispose();
  };
  try {
    bootstrapUrl = URL.createObjectURL(
      new Blob([`await import(${JSON.stringify(workerModuleUrl)});`], { type: 'text/javascript' }),
    );
    worker = new Worker(bootstrapUrl, { type: 'module', name: receipt.project.databasePrefix });
    worker.addEventListener('error', onWorkerError);
    worker.addEventListener('messageerror', onWorkerError);
    await waitForWorkerReady(worker, admission.signal);
    workspace = createFileSystemBridgeProxy(createFileSystemBridge(worker));
    await workspace.ready;
    await workspace.configureProjectRoots({ projects: [receipt.project], roots: [] });
    await service.configureProjectRoots({ projects: [receipt.project], roots: [] });
    const mount = mounts.listMounts().find((candidate) => candidate.routeId === receipt.project.projectId);
    if (!mount?.storageRootKey) {
      throw new Error('Raw projection import has no rooted physical authority.');
    }
    const { storageRootKey } = mount;
    writer = createFileSystemBridgeProxy(
      openFileSystemBridge(worker, { root: mount.prefix, consumer: 'working-copy' }),
    );
    await writer.ready;
    const hello = writer.hello.payload;
    if (hello.state !== 'ready' || hello.capabilities.durability !== 'exclusive-append') {
      throw new Error('Projection worker did not admit the exclusive-append physical authority.');
    }
    const destination = writer;
    // The standard bridge has no ranged read method. Keep physical verification on the same rooted provider locally.
    const rooted = service.createRootedFileSystem(mount.prefix);
    if (!rooted.readFileStream) {
      throw new Error('Raw projection import requires append and bounded read capabilities.');
    }
    const appendFile = destination.appendFile.bind(destination);
    const readFileStream = rooted.readFileStream.bind(rooted);
    if (await rooted.exists('tau.json')) {
      throw new Error('Raw projection import requires a fresh absent project.');
    }
    for (const directory of receipt.directories) {
      await destination.mkdir(directory, { recursive: true });
    }
    let fileIndex = 0;
    let offset = 0;
    const append = async (path: string, position: number, base64: string) => {
      const file = receipt.files[fileIndex];
      const bytes = base64ToUint8Array(base64);
      if (
        !file ||
        file.path !== path ||
        position !== offset ||
        bytes.byteLength !== Math.min(65_536, file.byteLength - offset) ||
        (bytes.byteLength > 0 && (await digestBytes(bytes)) !== file.chunkSha256[offset / 65_536])
      ) {
        throw new Error('Raw projection chunk identity/order/byte proof mismatch.');
      }
      await (offset === 0 ? destination.writeFile(path, bytes) : appendFile(path, bytes));
      offset += bytes.byteLength;
      if (offset === file.byteLength) {
        // Reacquire physical bytes through bounded range reads; never re-export or assemble the whole file.
        for (let position = 0; position < file.byteLength; position += 65_536) {
          const length = Math.min(65_536, file.byteLength - position);
          const reader = readFileStream(path, { position, length }).getReader();
          const actual = new Uint8Array(length);
          let read = 0;
          try {
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) {
                break;
              }
              actual.set(chunk.value, read);
              read += chunk.value.byteLength;
            }
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
          if (read !== length || (await digestBytes(actual)) !== file.chunkSha256[position / 65_536]) {
            throw new Error('Raw projection physical round-trip chunk proof mismatch.');
          }
        }
        const stat = await rooted.stat(path, { content: 'head' });
        if (stat.size !== file.byteLength) {
          throw new Error('Raw projection physical length mismatch.');
        }
        fileIndex += 1;
        offset = 0;
      }
    };
    return {
      workerUrl: bootstrapUrl,
      append,
      finish: async () => {
        if (fileIndex !== receipt.files.length || offset !== 0) {
          throw new Error('Raw projection import ended before its complete closure.');
        }
        const actualPaths: string[] = [];
        const walk = async (directory: string): Promise<void> => {
          for (const name of await rooted.readdir(directory)) {
            if (name.endsWith('.lock')) {
              continue;
            }
            const path = directory ? `${directory}/${name}` : name;
            actualPaths.push(path);
            const stat = await rooted.stat(path, { content: 'head' });
            if (stat.type === 'dir') {
              await walk(path);
            }
          }
        };
        await walk('');
        const expectedPaths = [...receipt.directories, ...receipt.files.map((file) => file.path)];
        if (JSON.stringify(actualPaths.sort()) !== JSON.stringify(expectedPaths.sort())) {
          throw new Error('Raw projection imported physical closure differs from receipt.');
        }
        return { files: fileIndex, storageRootKey };
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
};

/* oxlint-enable no-await-in-loop */
