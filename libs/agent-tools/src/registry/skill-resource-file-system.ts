/**
 * Read-only package skill resources overlaid on an authored project filesystem.
 *
 * @module
 */

import type { RpcDirectoryEntry, RpcFileStat, RpcFileSystem } from '@taucad/chat/rpc';
import { getErrno } from '@taucad/utils/error';
import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';

const skillsRoot = '.agents/skills';
const immutableDate = '1970-01-01T00:00:00.000Z';
const decoder = new TextDecoder('utf-8', { fatal: true });

/** One generated package resource. @public */
export type SkillResourceDescriptor = {
  readonly path: string;
  readonly url: string;
  readonly byteLength: number;
  readonly lineCount: number;
  readonly contentKind: 'text';
  readonly mediaType: 'text/markdown';
  readonly sha256: string;
};

/** One complete, immutable package-owned system skill. @public */
export type SystemSkillBundle = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly whenToUse: string;
  readonly body: string;
  readonly fingerprint: string;
  readonly files: readonly SkillResourceDescriptor[];
};

/** Host-specific resource byte reader. @public */
export type ReadSkillResource = (
  resource: SkillResourceDescriptor,
  options: { readonly signal?: AbortSignal },
) => Promise<Uint8Array<ArrayBuffer>>;

type RegistryNode =
  | { readonly type: 'dir'; readonly children: readonly string[] }
  | {
      readonly type: 'file';
      readonly resource: SkillResourceDescriptor;
    };

/** Validated package bundle index shared by native projections. @public */
export type SkillBundleRegistry = {
  readonly bundles: readonly SystemSkillBundle[];
  readonly bundle: (slug: string) => SystemSkillBundle | undefined;
  readonly node: (path: string) => RegistryNode | undefined;
};

const fileSystemError = (code: 'EIO' | 'EISDIR' | 'ENOENT' | 'EROFS', path: string): Error & { code: string } =>
  Object.assign(new Error(`${code}: ${path}`), { code });

/**
 * Validate and index generated package skill bundles.
 *
 * @param bundles - Generated bundle descriptors from an embedding app.
 * @returns The immutable registry used by native and future protocol projections.
 * @public
 */
export const createSkillBundleRegistry = (bundles: readonly SystemSkillBundle[]): SkillBundleRegistry => {
  const bySlug = new Map<string, SystemSkillBundle>();
  const files = new Map<string, SkillResourceDescriptor>();
  const childSets = new Map<string, Set<string>>([
    ['', new Set(['.agents'])],
    ['.agents', new Set(['skills'])],
    [skillsRoot, new Set()],
  ]);

  const addDirectory = (path: string): void => {
    if (childSets.has(path)) {
      return;
    }
    if (files.has(path)) {
      throw new Error(`system skill resource is both a file and directory: ${path}`);
    }
    childSets.set(path, new Set());
    const separator = path.lastIndexOf('/');
    const parent = separator === -1 ? '' : path.slice(0, separator);
    childSets.get(parent)?.add(path.slice(separator + 1));
  };

  for (const bundle of bundles) {
    if (!/^[\da-z-]+$/u.test(bundle.slug) || bySlug.has(bundle.slug)) {
      throw new Error(`invalid or duplicate system skill slug: ${bundle.slug}`);
    }
    if (bundle.files[0]?.path !== 'SKILL.md') {
      throw new Error(`system skill ${bundle.slug} must declare SKILL.md first`);
    }
    bySlug.set(bundle.slug, bundle);
    const bundleRoot = `${skillsRoot}/${bundle.slug}`;
    addDirectory(bundleRoot);

    for (const resource of bundle.files) {
      const relative = assertRootedPath(resource.path);
      if (relative === '' || relative !== resource.path) {
        throw new Error(`invalid system skill resource path: ${bundle.slug}/${resource.path}`);
      }
      const path = `${bundleRoot}/${relative}`;
      if (files.has(path) || childSets.has(path)) {
        throw new Error(`duplicate system skill resource path: ${path}`);
      }
      const segments = relative.split('/');
      let parent = bundleRoot;
      for (const segment of segments.slice(0, -1)) {
        parent = joinRelativePath(parent, segment);
        addDirectory(parent);
      }
      childSets.get(parent)?.add(segments.at(-1) ?? '');
      files.set(path, resource);
    }
  }

  const nodes = new Map<string, RegistryNode>();
  for (const [path, children] of childSets) {
    nodes.set(path, { type: 'dir', children: Object.freeze([...children]) });
  }
  for (const [path, resource] of files) {
    nodes.set(path, { type: 'file', resource });
  }
  const immutableBundles = Object.freeze([...bundles]);
  return Object.freeze({
    bundles: immutableBundles,
    bundle: (slug: string) => bySlug.get(slug),
    node: (path: string) => nodes.get(path),
  });
};

const lowerSlug = (path: string): string | undefined => {
  if (!path.startsWith(`${skillsRoot}/`)) {
    return undefined;
  }
  return path.slice(skillsRoot.length + 1).split('/')[0];
};

/** Options for {@link createSkillResourceFileSystem}. @public */
export type SkillResourceFileSystemOptions = {
  readonly upper: RpcFileSystem;
  readonly registry: SkillBundleRegistry;
  readonly readResource: ReadSkillResource;
  readonly signal?: AbortSignal;
};

/**
 * Overlay package skill resources on a project filesystem without copying them.
 *
 * @param options - Authored upper layer, immutable registry and physical reader.
 * @returns One `RpcFileSystem` with directory-atomic user precedence.
 * @public
 */
export const createSkillResourceFileSystem = (options: SkillResourceFileSystemOptions): RpcFileSystem => {
  const { upper, registry, readResource, signal } = options;

  const optionalUpperStat = async (path: string): Promise<RpcFileStat | undefined> => {
    try {
      return await upper.stat(path);
    } catch (error) {
      if (getErrno(error) === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  };

  const upperOwns = async (path: string): Promise<boolean> => {
    const agents = await optionalUpperStat('.agents');
    if (path === '.agents') {
      return agents !== undefined;
    }
    if (agents && !agents.isDirectory) {
      return true;
    }
    const skills = await optionalUpperStat(skillsRoot);
    if (path === skillsRoot) {
      return skills !== undefined;
    }
    if (skills && !skills.isDirectory) {
      return true;
    }
    const slug = lowerSlug(path);
    return slug === undefined ? false : (await optionalUpperStat(`${skillsRoot}/${slug}`)) !== undefined;
  };

  const lowerOwns = (path: string): boolean => {
    if (path === '.agents' || path === skillsRoot) {
      return true;
    }
    const slug = lowerSlug(path);
    return slug !== undefined && registry.bundle(slug) !== undefined;
  };

  const routesToLower = async (path: string): Promise<boolean> => lowerOwns(path) && !(await upperOwns(path));

  const lowerEntry = (name: string, node: RegistryNode): RpcDirectoryEntry =>
    node.type === 'dir'
      ? { name, type: 'dir', size: 0, traverseOnImplicitSearch: false }
      : {
          name,
          type: 'file',
          size: node.resource.byteLength,
          contentKind: 'text',
          lineCount: node.resource.lineCount,
        };

  const lowerEntries = (path: string): RpcDirectoryEntry[] => {
    const node = registry.node(path);
    if (!node) {
      throw fileSystemError('ENOENT', path);
    }
    if (node.type !== 'dir') {
      throw fileSystemError('EISDIR', path);
    }
    return node.children.map((name) => {
      const childPath = joinRelativePath(path, name);
      const child = registry.node(childPath);
      if (!child) {
        throw fileSystemError('EIO', childPath);
      }
      return lowerEntry(name, child);
    });
  };

  const mergedEntries = async (path: string): Promise<RpcDirectoryEntry[]> => {
    let upperEntries: RpcDirectoryEntry[] = [];
    try {
      upperEntries = await upper.readdir(path);
    } catch (error) {
      if (getErrno(error) !== 'ENOENT') {
        throw error;
      }
    }
    const names = new Set(upperEntries.map(({ name }) => name));
    return [...upperEntries, ...lowerEntries(path).filter(({ name }) => !names.has(name))];
  };

  const mutation = async <T>(path: string, mutate: () => Promise<T>): Promise<T> => {
    const canonical = assertRootedPath(path);
    if (await routesToLower(canonical)) {
      throw fileSystemError('EROFS', canonical);
    }
    return mutate();
  };

  return {
    async readFile(path) {
      const canonical = assertRootedPath(path);
      if (!(await routesToLower(canonical))) {
        return upper.readFile(canonical);
      }
      const node = registry.node(canonical);
      if (!node) {
        throw fileSystemError('ENOENT', canonical);
      }
      if (node.type !== 'file') {
        throw fileSystemError('EISDIR', canonical);
      }
      try {
        const bytes = await readResource(node.resource, signal ? { signal } : {});
        if (bytes.byteLength !== node.resource.byteLength) {
          throw fileSystemError('EIO', canonical);
        }
        return decoder.decode(bytes);
      } catch (error) {
        signal?.throwIfAborted();
        if (getErrno(error) === 'EIO') {
          throw error;
        }
        throw Object.assign(new Error(`EIO: could not read ${canonical}`), {
          code: 'EIO',
          cause: error,
        });
      }
    },
    writeFile: async (path, content) => mutation(path, async () => upper.writeFile(path, content)),
    writeBinaryFile: async (path, data) => mutation(path, async () => upper.writeBinaryFile(path, data)),
    deleteFile: async (path) => mutation(path, async () => upper.deleteFile(path)),
    async readdir(path) {
      const canonical = assertRootedPath(path);
      if (canonical === '' || canonical === '.agents' || canonical === skillsRoot) {
        if (canonical !== '' && (await upperOwns(canonical))) {
          const stat = await upper.stat(canonical);
          if (!stat.isDirectory) {
            return upper.readdir(canonical);
          }
        }
        return mergedEntries(canonical);
      }
      return (await routesToLower(canonical)) ? lowerEntries(canonical) : upper.readdir(canonical);
    },
    async exists(path) {
      const canonical = assertRootedPath(path);
      return (await routesToLower(canonical)) ? registry.node(canonical) !== undefined : upper.exists(canonical);
    },
    appendFile: async (path, content) => mutation(path, async () => upper.appendFile(path, content)),
    editFile: async (...args) => mutation(args[0], async () => upper.editFile(...args)),
    async stat(path) {
      const canonical = assertRootedPath(path);
      if (!(await routesToLower(canonical))) {
        return upper.stat(canonical);
      }
      const node = registry.node(canonical);
      if (!node) {
        throw fileSystemError('ENOENT', canonical);
      }
      return node.type === 'dir'
        ? {
            size: 0,
            isDirectory: true,
            createdAt: immutableDate,
            modifiedAt: immutableDate,
          }
        : {
            size: node.resource.byteLength,
            isDirectory: false,
            createdAt: immutableDate,
            modifiedAt: immutableDate,
            contentKind: 'text',
            lineCount: node.resource.lineCount,
          };
    },
  };
};
