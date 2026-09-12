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
import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';

const skillsRoot = '.agents/skills';

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

const slugOf = (path: string): string | undefined =>
  path.startsWith(`${skillsRoot}/`) ? path.slice(skillsRoot.length + 1).split('/')[0] : undefined;

/**
 * Project an indexed bundle set as the read-only overlay a composed view
 * merges at `.agents/skills`.
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
 * import { composeView } from '@taucad/filesystem/composed-view';
 * import { createSkillBundleOverlay, createSkillBundleRegistry } from '@taucad/agent-tools/registry';
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
      if (node === undefined || node.type !== 'file') {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      }
      return readResource(node.resource, options?.signal ? { signal: options.signal } : {});
    },
  });
