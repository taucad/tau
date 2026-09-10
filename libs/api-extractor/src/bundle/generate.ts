/**
 * The one table naming every package that owns a skill bundle, and the run that
 * regenerates all of them.
 *
 * Everything an owner cannot derive from its API — slug, title, description,
 * when to activate, and the axis its reference files are grouped along — is
 * declared here once. Everything else is read: the corpus from its extractor or
 * its committed artifact, the authored prose from the owner's `agent/doctrine.md`,
 * and the version from the owner's own `package.json`, because a bundle ships in
 * the same tarball at the same version as the API it describes (R10).
 *
 * The grouping axis is explicit per owner and never inferred, for the reason
 * `shard-plan.ts` gives: no single field is populated across every language.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import type { TauSkillsManifest } from '#bundle/bundle.types.js';
import { doctrineFile, skillsManifestFile } from '#bundle/bundle.types.js';
import type { WrittenBundle } from '#bundle/write-bundle.js';
import { readDoctrine, writeCorpusBundle, writeDoctrineBundle } from '#bundle/write-bundle.js';
import { loadKclCorpus } from '#languages/kcl/extract.js';
import { loadOpenscadCorpus } from '#languages/openscad/extract.js';
import { extractTypescriptApi } from '#languages/typescript/extract.js';
import type { ApiCorpus, ApiEntry } from '#model/api-corpus.types.js';

/** Workspace root, from this file's own location. @internal */
const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url));

const generatedRoot = fileURLToPath(new URL('../generated/', import.meta.url));

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

/** A package's declared version, read from the installed or workspace manifest. */
const versionOf = (packageDirectory: string): string =>
  readJson<{ readonly version: string }>(join(packageDirectory, 'package.json')).version;

/** A committed corpus artifact under `src/generated`. */
const committedCorpus =
  (relativePath: string): (() => ApiCorpus) =>
  (): ApiCorpus =>
    readJson<ApiCorpus>(join(generatedRoot, relativePath));

/**
 * A TypeScript surface, extracted with the checker.
 *
 * The version always comes from the installed package, because that is what the
 * declarations describe. `sourceRoot` redirects only the entry point, for the one
 * owner whose declarations ship as a committed module tree rather than a package.
 */
const typescriptCorpus = (packageName: string, entryPoint: string, sourceRoot?: string) => (): ApiCorpus => {
  const installed = join(workspaceRoot, 'node_modules', packageName);
  return extractTypescriptApi({
    packageName,
    packageVersion: versionOf(installed),
    entryPoints: [join(sourceRoot ?? installed, entryPoint)],
  });
};

/** Group label for a language whose only neutral axis is the kind of declaration. */
const byKind = (entry: ApiEntry): string => `${entry.kind.charAt(0).toUpperCase()}${entry.kind.slice(1)}s`;

/** OCCT's own namespacing: the prefix before the first underscore (R14). */
const byOcctPackage = (entry: ApiEntry): string => entry.name.split('_')[0] ?? 'other';

const byCategory = (entry: ApiEntry): string => entry.category ?? 'other';

/** One package that owns a bundle. @public */
export type BundleOwner = {
  readonly slug: string;
  /** Owning package directory, relative to the workspace root. */
  readonly packageDirectory: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly whenToUse: string;
  /** Absent for an authored-procedure bundle with no API behind it. */
  readonly corpus?: () => ApiCorpus;
  readonly groupBy?: (entry: ApiEntry) => string;
  /** Named groups materialize eagerly; every other group becomes cold. */
  readonly eagerGroups?: () => readonly string[];
};

/**
 * Every skill-owning package, and how its bundle is built.
 *
 * @public
 */
export const bundleOwners: readonly BundleOwner[] = [
  {
    slug: 'cad-replicad',
    packageDirectory: 'packages/plugins/replicad',
    name: 'Replicad authoring',
    title: 'Replicad authoring',
    description:
      'Guides precise Replicad BRep authoring in main.ts. Use when creating or editing TypeScript geometry imported from replicad.',
    whenToUse: 'Use when creating or editing TypeScript geometry imported from replicad.',
    corpus: typescriptCorpus('replicad', 'dist/replicad.d.ts'),
    groupBy: byKind,
  },
  {
    slug: 'cad-jscad',
    packageDirectory: 'packages/plugins/jscad',
    name: 'JSCAD authoring',
    title: 'JSCAD authoring',
    description:
      'Guides JSCAD modeling in main.ts with 2D-first CSG and deliberate tessellation. Use when creating or editing @jscad/modeling geometry.',
    whenToUse: 'Use when creating or editing @jscad/modeling geometry.',
    corpus: typescriptCorpus('@jscad/modeling', 'src/index.d.ts'),
    // Every top-level export is a namespace, which is the axis a JSCAD author
    // already navigates by (`primitives`, `booleans`, `transforms`).
    groupBy: (entry) => (entry.kind === 'namespace' ? entry.name : byKind(entry)),
  },
  {
    slug: 'cad-manifold',
    packageDirectory: 'packages/plugins/manifold',
    name: 'Manifold authoring',
    title: 'Manifold authoring',
    description:
      'Guides robust Manifold mesh CAD in main.ts. Use when creating or editing TypeScript geometry with manifold-3d/manifoldCAD.',
    whenToUse: 'Use when creating or editing TypeScript geometry with manifold-3d/manifoldCAD.',
    corpus: typescriptCorpus('manifold-3d', 'manifold.d.ts'),
    groupBy: byKind,
  },
  {
    slug: 'cad-opencascadejs',
    packageDirectory: 'packages/plugins/opencascade',
    name: 'OpenCascade.js authoring',
    title: 'OpenCascade.js authoring',
    description:
      'Guides direct OpenCascade.js BRep authoring in main.ts. Use when creating or editing libcascade geometry.',
    whenToUse: 'Use when creating or editing libcascade geometry.',
    // The committed module tree, not `node_modules`: the surface is the shipped
    // artifact, so the bundle regenerates identically without the kernel installed.
    corpus: typescriptCorpus('libcascade', 'index.d.ts', join(generatedRoot, 'opencascade/modules/libcascade')),
    groupBy: byOcctPackage,
    eagerGroups: () =>
      readJson<{ readonly eager: readonly string[] }>(join(generatedRoot, 'opencascade/opencascade.shards.json')).eager,
  },
  {
    slug: 'cad-build123d',
    packageDirectory: 'packages/plugins/build123d',
    name: 'Build123d authoring',
    title: 'Build123d authoring',
    description:
      'Guides native Build123d BRep authoring in main.py. Use when creating or editing trusted Python CAD projects in Tau Desktop.',
    whenToUse: 'Use when creating or editing trusted Python CAD projects in Tau Desktop.',
    corpus: committedCorpus('build123d/build123d.bundled.json'),
    groupBy: byCategory,
  },
  {
    slug: 'cad-picogk',
    packageDirectory: 'packages/plugins/picogk',
    name: 'PicoGK C# authoring',
    title: 'PicoGK C# authoring',
    description:
      'Guides trusted, upstream-compatible PicoGK C# voxel authoring in main.cs. Use when creating or editing PicoGK projects in Tau Desktop.',
    whenToUse: 'Use when creating or editing PicoGK projects in Tau Desktop.',
    corpus: committedCorpus('picogk/picogk.corpus.json'),
    // C# namespaces: `PicoGK`, `PicoGK.Shapes`, `System.Numerics`.
    groupBy: (entry) => entry.path ?? 'other',
  },
  {
    slug: 'cad-openscad',
    packageDirectory: 'packages/plugins/openrscad',
    name: 'OpenSCAD authoring',
    title: 'OpenSCAD authoring',
    description:
      'Guides OpenSCAD model authoring in main.scad with idiomatic CSG and adaptive tessellation. Use when creating or editing .scad geometry.',
    whenToUse: 'Use when creating or editing .scad geometry.',
    corpus: () => loadOpenscadCorpus(),
    groupBy: byCategory,
  },
  {
    slug: 'cad-zoo',
    packageDirectory: 'packages/plugins/zoo',
    name: 'Zoo KCL authoring',
    title: 'Zoo KCL authoring',
    description:
      'Guides Zoo KCL modeling in main.kcl with pipe-based analytical geometry. Use when creating or editing KCL models.',
    whenToUse: 'Use when creating or editing KCL models.',
    // The extraction timestamp never reaches a rendered file, so the default is safe.
    corpus: () => loadKclCorpus(),
    groupBy: byCategory,
  },
  {
    slug: 'geospec-authoring',
    packageDirectory: 'packages/geospec',
    name: 'GeoSpec authoring',
    title: 'GeoSpec authoring',
    description:
      'Guides deterministic GeoSpec test authoring and repair. Use before creating or editing *.geospec.ts or *.geospec.js files.',
    whenToUse: 'Use before creating or editing *.geospec.ts or *.geospec.js files.',
  },
];

/** What one owner's regeneration produced. @public */
export type GeneratedOwner = {
  readonly slug: string;
  readonly packageDirectory: string;
  readonly bundle: WrittenBundle;
};

/**
 * Regenerate every owner's bundle and its `agent/skills.json`.
 *
 * Authored doctrine is always read from the workspace, which is its only source
 * of truth; only the generated output is redirected, so the regeneration gate
 * can write into operating-system temporary storage and diff.
 *
 * @param options - `outputRoot` replaces the workspace root for writes only.
 * @returns One record per owner, in table order.
 * @public
 */
export const generateBundles = async (
  options: { readonly outputRoot?: string } = {},
): Promise<readonly GeneratedOwner[]> => {
  const outputRoot = options.outputRoot ?? workspaceRoot;
  const generated: GeneratedOwner[] = [];

  for (const owner of bundleOwners) {
    const sourceAgent = join(workspaceRoot, owner.packageDirectory, 'agent');
    const outputAgent = join(outputRoot, owner.packageDirectory, 'agent');
    const shared = {
      slug: owner.slug,
      name: owner.name,
      title: owner.title,
      description: owner.description,
      version: versionOf(join(workspaceRoot, owner.packageDirectory)),
      whenToUse: owner.whenToUse,
      // oxlint-disable-next-line no-await-in-loop -- Sequential by design: one owner compiles 12 MB of declarations, so overlapping the nine would multiply peak memory for no wall-clock gain.
      doctrine: await readDoctrine(join(sourceAgent, doctrineFile)),
    };

    const bundle =
      owner.corpus === undefined || owner.groupBy === undefined
        ? // oxlint-disable-next-line no-await-in-loop -- See above.
          await writeDoctrineBundle(join(outputAgent, owner.slug), shared)
        : // oxlint-disable-next-line no-await-in-loop -- See above.
          await writeCorpusBundle(owner.corpus(), join(outputAgent, owner.slug), {
            ...shared,
            groupBy: owner.groupBy,
            ...(owner.eagerGroups === undefined ? {} : { eagerGroups: owner.eagerGroups() }),
          });

    const manifest: TauSkillsManifest = { bundles: [bundle.declaration] };
    // oxlint-disable-next-line no-await-in-loop -- See above.
    await writeFile(join(outputAgent, skillsManifestFile), `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8');

    generated.push({ slug: owner.slug, packageDirectory: owner.packageDirectory, bundle });
  }

  return generated;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const generated = await generateBundles();
  for (const owner of generated) {
    console.log(
      `${owner.slug}: ${String(owner.bundle.shardCount)} shards, ${String(owner.bundle.bodyTokens)} body tokens, ${String(owner.bundle.bytes)} bytes -> ${owner.packageDirectory}/agent`,
    );
  }
}
