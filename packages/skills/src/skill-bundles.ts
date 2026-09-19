/**
 * Resolving and installing the skill bundles the owner packages declare.
 *
 * This package is dependency-only. It carries no copy of any bundle: every
 * bundle is read out of the package that owns the API it documents, resolved by
 * bare specifier through `import.meta.resolve`. A copy here could describe a
 * version its owner had already moved past, which is the single failure this
 * shape exists to make impossible.
 *
 * @module
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, posix, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The packages that own a Tau CAD skill bundle.
 *
 * Every entry is a declared dependency of this package, so each resolves from
 * this module's own graph on any host. Packages that deliberately ship no
 * bundle declare `tau.skills: null` with a reason and are absent here.
 *
 * @public
 */
export const skillOwners: readonly string[] = [
  '@taucad/build123d',
  '@taucad/jscad',
  '@taucad/manifold',
  '@taucad/opencascade',
  '@taucad/openrscad',
  '@taucad/picogk',
  '@taucad/replicad',
  '@taucad/zoo',
  'geospec',
];

/** One file of a bundle, addressed both ways. @public */
export type BundleFile = {
  /** Path relative to the bundle directory, e.g. `api-index.md`. */
  readonly path: string;
  /** Bare specifier that resolves it, e.g. `@taucad/replicad/agent/api-index.md`. */
  readonly specifier: string;
  /** Resolved location. `file:` under Node, an asset URL under a bundler. */
  readonly url: string;
};

/** A bundle as this package resolved it. @public */
export type ResolvedBundle = {
  /** The package that owns the API the bundle documents. */
  readonly owner: string;
  /** Skill name as an agent activates it, e.g. `cad-replicad`. */
  readonly slug: string;
  /** Every file in the bundle. `SKILL.md` first. */
  readonly files: readonly BundleFile[];
};

/**
 * The bundle rows of an owner's `agent/skills.json`.
 *
 * Only the fields this package acts on are modelled. The manifest carries
 * catalogue metadata (`name`, `description`, `whenToUse`) that a host reads
 * from `SKILL.md`'s own front matter, so restating it here would be a second
 * copy of the same fact.
 *
 * @internal
 */
type ManifestBundle = {
  readonly slug: string;
  readonly directory: string;
  readonly files: readonly string[];
};

/**
 * Validate and normalize an untrusted package-relative manifest path.
 *
 * @internal
 * @param path - A package-relative path, with or without a `./` prefix.
 * @returns The normalized path, with no leading slash.
 * @throws When the path can escape its package or target skill directory.
 */
export const normalizeBundlePath = (path: string): string => {
  const normalized = posix.normalize(path);
  if (
    path === '' ||
    path.includes('\\') ||
    posix.isAbsolute(path) ||
    win32.isAbsolute(path) ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error(`skill manifest path must stay relative: ${path}`);
  }
  return normalized.replace(/^\.\//u, '');
};

/**
 * Read an owner's declared bundles.
 *
 * @internal
 * @param owner - Bare specifier of the owning package.
 * @returns Its bundles, or an empty list when it declares none.
 * @throws When the package declares a manifest that cannot be read or parsed.
 */
const resolveOwner = async (owner: string): Promise<readonly ResolvedBundle[]> => {
  const ownerManifest = JSON.parse(await readFile(new URL(import.meta.resolve(`${owner}/package.json`)), 'utf8')) as {
    readonly tau?: { readonly skills?: unknown };
  };
  const declared = ownerManifest.tau?.skills;
  if (typeof declared !== 'string' || declared === '') {
    return [];
  }

  const manifestPath = normalizeBundlePath(declared);
  const manifestDirectory = manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1);
  const skillsManifest = JSON.parse(
    await readFile(new URL(import.meta.resolve(`${owner}/${manifestPath}`)), 'utf8'),
  ) as { readonly bundles: readonly ManifestBundle[] };

  return skillsManifest.bundles.map((bundle) => {
    if (!/^[\da-z-]+$/u.test(bundle.slug)) {
      throw new Error(`invalid skill slug from ${owner}: ${bundle.slug}`);
    }
    const directory = normalizeBundlePath(bundle.directory);
    return {
      owner,
      slug: bundle.slug,
      files: bundle.files.map((file) => {
        const relativeFile = normalizeBundlePath(file);
        const path = normalizeBundlePath(`${manifestDirectory}${directory}/${relativeFile}`);
        const specifier = `${owner}/${path}`;
        return { path: relativeFile, specifier, url: import.meta.resolve(specifier) };
      }),
    };
  });
};

/**
 * Resolve every skill bundle the given owners declare.
 *
 * @param owners - Packages to read. Defaults to {@link skillOwners}.
 * @returns One entry per declared bundle, in owner order.
 * @public
 *
 * @example <caption>List what adoption would install</caption>
 * ```typescript
 * import { resolveSkillBundles } from '@taucad/skills';
 *
 * for (const bundle of await resolveSkillBundles()) {
 *   console.log(bundle.slug, bundle.files.length);
 * }
 * ```
 */
export const resolveSkillBundles = async (
  owners: readonly string[] = skillOwners,
): Promise<readonly ResolvedBundle[]> => {
  const perOwner = await Promise.all(owners.map(async (owner) => resolveOwner(owner)));
  return perOwner.flat();
};

/**
 * Copy every resolved bundle into a skills directory.
 *
 * Each bundle lands at `<directory>/<slug>/`, the layout every agent host that
 * reads filesystem skills expects. Existing files are overwritten, so a rerun
 * after upgrading a dependency refreshes the bundles in place.
 *
 * @param directory - Target skills directory, e.g. `.agents/skills`.
 * @param owners - Packages to read. Defaults to {@link skillOwners}.
 * @returns The slugs written, in owner order.
 * @public
 *
 * @example <caption>One-command adoption, from code</caption>
 * ```typescript
 * import { installSkills } from '@taucad/skills';
 *
 * await installSkills('.agents/skills');
 * ```
 */
export const installSkills = async (
  directory: string,
  owners: readonly string[] = skillOwners,
): Promise<readonly string[]> => {
  const bundles = await resolveSkillBundles(owners);
  const copies = bundles.flatMap((bundle) =>
    bundle.files.map(async (file): Promise<void> => {
      const target = join(directory, bundle.slug, file.path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(fileURLToPath(file.url), target);
    }),
  );
  await Promise.all(copies);
  return bundles.map((bundle) => bundle.slug);
};
