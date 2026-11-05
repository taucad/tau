/**
 * Package-owned skill bundles, projected as a composed-view overlay.
 *
 * The bundles are data — a slug, a version, a fingerprint and a list of
 * generated resources — and this module turns them into the
 * {@link ComposedViewOverlay} `@taucad/filesystem` composes at
 * `.agents/skills`. The merge itself is not here and must not be: one function
 * composes every view on every host (charter D1), and a second merge beside it
 * is the split-brain this replaced.
 *
 * @module
 */

import type { ComposedViewOverlay } from '@taucad/filesystem/composed-view';
import { sha256Bytes } from '@taucad/utils/hash';
import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';

const skillsRoot = '.agents/skills';
const textEncoder = new TextEncoder();

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
      /**
       * The resource's bytes when the registry already holds them — a bundle's
       * `SKILL.md` whose encoded `body` matches the declared byte length — so a
       * read never reaches the host reader.
       */
      readonly inline?: Uint8Array<ArrayBuffer>;
    };

/** Validated package bundle index shared by native projections. @public */
export type SkillBundleRegistry = {
  readonly bundles: readonly SystemSkillBundle[];
  readonly bundle: (slug: string) => SystemSkillBundle | undefined;
  readonly node: (path: string) => RegistryNode | undefined;
};

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
  const inline = new Map<string, Uint8Array<ArrayBuffer>>();
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
    /* The catalog body is the SKILL.md text; a length mismatch means the
     * generator changed shape, so the host reader stays authoritative. */
    const bodyBytes = textEncoder.encode(bundle.body);
    if (bodyBytes.byteLength === bundle.files[0].byteLength) {
      inline.set(`${bundleRoot}/SKILL.md`, bodyBytes);
    }

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
    const bytes = inline.get(path);
    nodes.set(path, bytes === undefined ? { type: 'file', resource } : { type: 'file', resource, inline: bytes });
  }
  const immutableBundles = Object.freeze([...bundles]);
  return Object.freeze({
    bundles: immutableBundles,
    bundle: (slug: string) => bySlug.get(slug),
    node: (path: string) => nodes.get(path),
  });
};

const slugOf = (path: string): string | undefined =>
  path.startsWith(`${skillsRoot}/`) ? path.slice(skillsRoot.length + 1).split('/')[0] : undefined;

/**
 * Project an indexed bundle set as the read-only overlay a composed view
 * merges at `.agents/skills`.
 *
 * A bundle's `SKILL.md` is served from its catalog `body` when the encoded
 * length matches the descriptor, so it never reaches `readResource`.
 *
 * The unit is one slug: a project file or directory at `.agents/skills/<slug>`
 * replaces that bundle whole, never file by file, and reports the replaced
 * bundle's identity (mount-provenance V8).
 *
 * @param registry - The validated bundle index.
 * @param readResource - Host reader for one generated resource's bytes.
 * @returns The overlay `composeView` consumes.
 * @public
 *
 * @example <caption>The daemon's agent view</caption>
 * ```typescript
 * import { createSkillBundleOverlay, createSkillBundleRegistry } from '@taucad/agent-tools/registry';
 * import type { ReadSkillResource, SystemSkillBundle } from '@taucad/agent-tools/registry';
 *
 * export function exampleOverlay(bundles: readonly SystemSkillBundle[], read: ReadSkillResource) {
 *   return createSkillBundleOverlay(createSkillBundleRegistry(bundles), read);
 * }
 * ```
 */
export const createSkillBundleOverlay = (
  registry: SkillBundleRegistry,
  readResource: ReadSkillResource,
): ComposedViewOverlay =>
  Object.freeze({
    root: skillsRoot,
    source: 'system-skills',
    unit: (path: string) => {
      const slug = slugOf(path);
      const bundle = slug === undefined ? undefined : registry.bundle(slug);
      return bundle === undefined
        ? undefined
        : {
            root: `${skillsRoot}/${bundle.slug}`,
            identity: `skill:${bundle.slug}@${bundle.version}#${bundle.fingerprint}`,
          };
    },
    node: (path: string) => {
      const node = registry.node(path);
      if (node === undefined) {
        return undefined;
      }
      return node.type === 'dir'
        ? ({ type: 'dir', children: node.children } as const)
        : ({
            type: 'file',
            size: node.resource.byteLength,
            contentKind: 'text',
            lineCount: node.resource.lineCount,
          } as const);
    },
    read: async (path: string, options?: { readonly signal?: AbortSignal }) => {
      const node = registry.node(path);
      if (node?.type !== 'file') {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      }
      if (node.inline !== undefined) {
        options?.signal?.throwIfAborted();
        /* A copy: the registry's bytes outlive every caller. */
        return new Uint8Array(node.inline);
      }
      return readResource(node.resource, options?.signal === undefined ? {} : { signal: options.signal });
    },
  });

/** What one {@link createCachedSkillResourceReader} call did. @public */
export type SkillResourceCacheEvent = 'read' | 'fetch' | 'hit';

/** Cumulative counters of one cached skill resource reader. @public */
export type SkillResourceCacheStats = {
  /** Calls to the wrapped reader. */
  readonly fetches: number;
  /** Reads served without calling the wrapped reader: retained or in flight. */
  readonly hits: number;
  /** Bytes currently retained. */
  readonly bytes: number;
  /** Retained entries dropped to stay within `maxBytes`. */
  readonly evictions: number;
};

/** Options for {@link createCachedSkillResourceReader}. @public */
export type CachedSkillResourceReaderOptions = {
  /** Retained-byte budget; entries above half of it are never retained. Defaults to 16 MiB. */
  readonly maxBytes?: number;
  /** Check each fetched resource against its declared SHA-256. Defaults to `true`. */
  readonly verify?: boolean;
  /** Hand every caller its own copy instead of the shared cached array. Defaults to `false`. */
  readonly copy?: boolean;
  /** Observe each read, each wrapped-reader call and each read served without one. */
  readonly onEvent?: (event: SkillResourceCacheEvent, resource: SkillResourceDescriptor) => void;
};

/** A {@link ReadSkillResource} with a content-addressed cache in front of it. @public */
export type CachedSkillResourceReader = {
  readonly read: ReadSkillResource;
  readonly stats: () => SkillResourceCacheStats;
};

const defaultMaxBytes = 16 * 1024 * 1024;

const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });

/** Settle with `promise`, or reject with this caller's abort reason first. */
const untilAborted = async <T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> => {
  if (signal === undefined) {
    return promise;
  }
  const { promise: aborted, reject } = Promise.withResolvers<never>();
  const onAbort = (): void => {
    reject(abortReason(signal));
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

/**
 * Wrap a host resource reader with a content-addressed cache.
 *
 * Resources are keyed by their declared SHA-256, so concurrent reads of one
 * resource share a single wrapped-reader call, and settled bytes stay in a
 * least-recently-used set bounded by `maxBytes`. A fetched resource whose
 * digest differs from its descriptor is discarded and rejects with `EIO`; the
 * next read fetches again. The shared fetch never sees a caller's signal: a
 * caller that aborts stops waiting, and every other caller is unaffected.
 *
 * Callers receive the cached array itself unless `copy` is set, so they must
 * not mutate it.
 *
 * @param read - The host reader, called at most once per resource while it is retained.
 * @param options - Budget, verification, copy and observation settings.
 * @returns The caching reader and its counters.
 * @public
 *
 * @example <caption>One cached reader per realm</caption>
 * ```typescript
 * import { createCachedSkillResourceReader } from '@taucad/agent-tools/registry';
 * import type { ReadSkillResource } from '@taucad/agent-tools/registry';
 *
 * export function cachedReader(read: ReadSkillResource) {
 *   return createCachedSkillResourceReader(read, { maxBytes: 8 * 1024 * 1024 });
 * }
 * ```
 */
export const createCachedSkillResourceReader = (
  read: ReadSkillResource,
  options: CachedSkillResourceReaderOptions = {},
): CachedSkillResourceReader => {
  const { maxBytes = defaultMaxBytes, verify = true, copy = false, onEvent } = options;
  const retainLimit = maxBytes / 2;
  const inFlight = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();
  /* Map iteration order is insertion order: the first key is least recent. */
  const retained = new Map<string, Uint8Array<ArrayBuffer>>();
  let fetches = 0;
  let hits = 0;
  let bytes = 0;
  let evictions = 0;

  const retain = (key: string, value: Uint8Array<ArrayBuffer>): void => {
    if (value.byteLength > retainLimit || retained.has(key)) {
      return;
    }
    retained.set(key, value);
    bytes += value.byteLength;
    for (const [oldest, oldBytes] of retained) {
      if (bytes <= maxBytes) {
        break;
      }
      retained.delete(oldest);
      bytes -= oldBytes.byteLength;
      evictions += 1;
    }
  };

  const fetchOnce = async (resource: SkillResourceDescriptor): Promise<Uint8Array<ArrayBuffer>> => {
    fetches += 1;
    onEvent?.('fetch', resource);
    const value = await read(resource, {});
    if (verify && (value.byteLength !== resource.byteLength || (await sha256Bytes(value)) !== resource.sha256)) {
      throw Object.assign(new Error(`EIO: system skill resource ${resource.path} does not match its digest`), {
        code: 'EIO',
      });
    }
    return value;
  };

  /* Bookkeeping awaits the fetch on a branch of its own, attached before any
   * caller, so a rejection reaches callers, never an unhandled-rejection
   * handler, and a caller resuming after the fetch already sees it retained. */
  const settle = async (key: string, pending: Promise<Uint8Array<ArrayBuffer>>): Promise<void> => {
    try {
      retain(key, await pending);
    } catch {
      /* Callers receive the rejection; nothing is retained, so the next read fetches again. */
    } finally {
      if (inFlight.get(key) === pending) {
        inFlight.delete(key);
      }
    }
  };

  const shared = async (resource: SkillResourceDescriptor): Promise<Uint8Array<ArrayBuffer>> => {
    const key = resource.sha256;
    const cached = retained.get(key);
    if (cached !== undefined) {
      retained.delete(key);
      retained.set(key, cached);
      hits += 1;
      onEvent?.('hit', resource);
      return cached;
    }
    const pending = inFlight.get(key);
    if (pending !== undefined) {
      hits += 1;
      onEvent?.('hit', resource);
      return pending;
    }
    const started = fetchOnce(resource);
    inFlight.set(key, started);
    void settle(key, started);
    return started;
  };

  return Object.freeze({
    read: async (resource: SkillResourceDescriptor, { signal }: { readonly signal?: AbortSignal }) => {
      signal?.throwIfAborted();
      onEvent?.('read', resource);
      const value = await untilAborted(shared(resource), signal);
      signal?.throwIfAborted();
      return copy ? new Uint8Array(value) : value;
    },
    stats: () => Object.freeze({ fetches, hits, bytes, evictions }),
  });
};
