import { extractReferencedGltfUris } from '#gltf.dependencies.js';

type ImportFileSystem = {
  readdir(path: string): Promise<readonly string[]>;
  stat(path: string): Promise<{ readonly type: string }>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
};

/** Files staged for one import-kernel invocation. @public */
export type ImportFileInventory = {
  readonly entryBytes: Uint8Array<ArrayBuffer>;
  readonly resolved: readonly string[];
  readonly unresolved: readonly string[];
  readonly resolver: {
    exists(filename: string): boolean;
    readFile(filename: string): Uint8Array<ArrayBuffer>;
  };
};

const resolveVirtualPath = (input: string): string => {
  if (input.length === 0 || !input.startsWith('/') || input.startsWith('//') || input.includes('\\')) {
    throw new TypeError(`Invalid virtual path: ${JSON.stringify(input)}`);
  }
  const segments: string[] = [];
  for (const segment of input.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.pop() === undefined) {
        throw new TypeError(`Virtual path escapes the filesystem root: ${JSON.stringify(input)}`);
      }
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join('/')}`;
};

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const parentDirectory = (path: string): string => path.slice(0, path.lastIndexOf('/')) || '/';
const extension = (path: string): string => basename(path).split('.').pop()?.toLowerCase() ?? '';
const isNotFound = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = Reflect.get(error, 'code');
  return code === 'ENOENT' || code === 'ENOTDIR';
};

const resolveGltfUri = (uri: string, entryPath: string): string => {
  if (
    uri.includes('\\') ||
    uri.includes('?') ||
    uri.includes('#') ||
    uri.startsWith('//') ||
    /^[A-Za-z][A-Za-z\d+.-]*:/u.test(uri)
  ) {
    throw new TypeError(`Unsupported glTF filesystem URI: ${JSON.stringify(uri)}`);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch (error) {
    throw new TypeError(`Malformed glTF filesystem URI: ${JSON.stringify(uri)}`, { cause: error });
  }
  const parent = parentDirectory(entryPath);
  const candidate = decoded.startsWith('/') ? decoded : `${parent === '/' ? '' : parent}/${decoded}`;
  return resolveVirtualPath(candidate);
};

/**
 * Inventory an import entry, sibling files, and referenced glTF sidecars.
 *
 * @param filesystem - Runtime filesystem capability.
 * @param rawEntryPath - Absolute virtual entry path.
 * @returns Deterministic import inventory and sidecar resolver.
 * @public
 */
export const createImportFileInventory = async (
  filesystem: ImportFileSystem,
  rawEntryPath: string,
): Promise<ImportFileInventory> => {
  const entryPath = resolveVirtualPath(rawEntryPath);
  const directory = parentDirectory(entryPath);
  const names = [...(await filesystem.readdir(directory))].sort();
  const bytesByPath = new Map<string, Uint8Array<ArrayBuffer>>();
  const resolverBytes = new Map<string, Uint8Array<ArrayBuffer>>();

  for (const name of names) {
    const path = resolveVirtualPath(`${directory === '/' ? '' : directory}/${name}`);
    try {
      // oxlint-disable-next-line no-await-in-loop -- deterministic provider inventory
      const stat = await filesystem.stat(path);
      if (stat.type !== 'file') {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- deterministic provider inventory
      const bytes = await filesystem.readFile(path);
      bytesByPath.set(path, bytes);
      resolverBytes.set(name, bytes);
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  let entryBytes = bytesByPath.get(entryPath);
  if (!entryBytes) {
    entryBytes = await filesystem.readFile(entryPath);
    bytesByPath.set(entryPath, entryBytes);
    resolverBytes.set(basename(entryPath), entryBytes);
  }

  const unresolved = new Set<string>();
  if (extension(entryPath) === 'gltf') {
    for (const uri of extractReferencedGltfUris(new TextDecoder().decode(entryBytes))) {
      const path = resolveGltfUri(uri, entryPath);
      let bytes = bytesByPath.get(path);
      if (!bytes) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- referenced URI order is deterministic
          bytes = await filesystem.readFile(path);
          bytesByPath.set(path, bytes);
        } catch (error) {
          if (isNotFound(error)) {
            unresolved.add(path);
            continue;
          }
          throw error;
        }
      }
      resolverBytes.set(uri, bytes);
    }
  }

  return {
    entryBytes,
    resolved: [...bytesByPath.keys()].sort(),
    unresolved: [...unresolved].sort(),
    resolver: {
      exists: (filename) => resolverBytes.has(filename),
      readFile(filename) {
        const bytes = resolverBytes.get(filename);
        if (!bytes) {
          throw new Error(`File not found: ${filename}`);
        }
        return bytes;
      },
    },
  };
};
