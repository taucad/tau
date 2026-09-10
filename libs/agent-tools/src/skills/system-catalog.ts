/**
 * The system-skill catalogue: one table, both hosts.
 *
 * A system skill is a guide that ships inside a package rather than living in
 * a workspace, so every host offers the same set — but they *read* it
 * differently: the browser inlines each guide with a bundler-only `?raw`
 * import, and a daemon resolves the same package subpath on disk. Only the
 * loading differs, so only the loading is host-specific; the rows below, and
 * the subpaths they name, are shared. Two hosts reading the same file is what
 * makes their fingerprints equal.
 *
 * The reader is injected rather than imported for the same reason the resolver
 * next door injects one: this module is bundled into the browser, so it may
 * not reach for `node:module` itself.
 *
 * @module
 */

import type { SystemSkillEntry } from '#skills/skill-resolver.js';

/** One compiled-in system skill and the package subpath holding its guide. @public */
export type SystemSkillCatalogEntry = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly whenToUse: string;
  /** Package export subpath whose target is the guide's `SKILL.md`. */
  readonly subpath: string;
};

/** Every package-backed system skill, in presentation order. @public */
export const systemSkillCatalog = [
  {
    slug: 'cad-build123d',
    name: 'Build123d Authoring',
    description:
      'Guides native Build123d BRep authoring in main.py. Use when creating or editing trusted Python CAD projects in Tau Desktop.',
    version: '1.0.0',
    whenToUse: 'Use for Build123d source, .py CAD files, or a Build123d-pinned desktop project.',
    subpath: '@taucad/build123d/agent',
  },
  {
    slug: 'cad-picogk',
    name: 'PicoGK Authoring',
    description:
      'Guides trusted PicoGK C# voxel authoring in main.cs. Use when creating or editing PicoGK projects in Tau Desktop.',
    version: '1.0.0',
    whenToUse: 'Use for PicoGK source, .cs CAD files, or a PicoGK-pinned desktop project.',
    subpath: '@taucad/picogk/agent',
  },
  {
    slug: 'cad-openscad',
    name: 'OpenSCAD Authoring',
    description:
      'Guides OpenSCAD model authoring in main.scad with idiomatic CSG and adaptive tessellation. Use when creating or editing .scad geometry.',
    version: '1.0.0',
    whenToUse: 'Use for OpenSCAD source, .scad files, or an OpenSCAD-pinned project.',
    subpath: '@taucad/openrscad/agent',
  },
  {
    slug: 'cad-replicad',
    name: 'Replicad Authoring',
    description:
      'Guides precise Replicad BRep authoring in main.ts. Use when creating or editing TypeScript geometry imported from replicad.',
    version: '1.0.0',
    whenToUse: 'Use for Replicad source, replicad imports, or a Replicad-pinned project.',
    subpath: '@taucad/replicad/agent',
  },
  {
    slug: 'cad-manifold',
    name: 'Manifold Authoring',
    description:
      'Guides robust Manifold mesh CAD in main.ts. Use when creating or editing TypeScript geometry with manifold-3d/manifoldCAD.',
    version: '1.0.0',
    whenToUse: 'Use for Manifold source, manifold-3d imports, or a Manifold-pinned project.',
    subpath: '@taucad/manifold/agent',
  },
  {
    slug: 'cad-zoo',
    name: 'Zoo KCL Authoring',
    description:
      'Guides Zoo KCL modeling in main.kcl with pipe-based analytical geometry. Use when creating or editing KCL models.',
    version: '1.0.0',
    whenToUse: 'Use for KCL source, .kcl files, or a Zoo-pinned project.',
    subpath: '@taucad/zoo/agent',
  },
  {
    slug: 'cad-jscad',
    name: 'JSCAD Authoring',
    description:
      'Guides JSCAD modeling in main.ts with 2D-first CSG and deliberate tessellation. Use when creating or editing @jscad/modeling geometry.',
    version: '1.0.0',
    whenToUse: 'Use for JSCAD source, @jscad/modeling imports, or a JSCAD-pinned project.',
    subpath: '@taucad/jscad/agent',
  },
  {
    slug: 'cad-opencascadejs',
    name: 'OpenCascade.js Authoring',
    description:
      'Guides direct OpenCascade.js BRep authoring in main.ts. Use when creating or editing libcascade geometry.',
    version: '1.0.0',
    whenToUse: 'Use for direct OpenCascade.js source, libcascade imports, or an OpenCascade-pinned project.',
    subpath: '@taucad/opencascade/agent',
  },
  {
    slug: 'geospec-authoring',
    name: 'GeoSpec Authoring',
    description:
      'Guides deterministic GeoSpec test authoring and repair. Use before creating or editing *.geospec.ts or *.geospec.js files.',
    version: '1.0.0',
    whenToUse: 'Use before creating, extending, or repairing any GeoSpec geometry test.',
    subpath: 'geospec/agent/skills.json',
  },
] as const satisfies readonly SystemSkillCatalogEntry[];

/** Slug of a package-backed system skill. @public */
export type SystemSkillSlug = (typeof systemSkillCatalog)[number]['slug'];

/** The manifest fields a system-skill entry is built from. */
type ManifestBundle = {
  readonly slug: string;
  readonly name: string;
  readonly version: string;
  readonly whenToUse: string;
  readonly body: string;
};

/**
 * Read the first bundle out of a parsed `agent/skills.json`.
 *
 * Validating rather than casting, because this crosses a package boundary: a
 * stale or half-generated manifest should make the host quietly not offer that
 * skill, exactly as an unresolvable package does, instead of advertising a skill
 * whose body is `undefined`.
 *
 * @param manifest - The parsed manifest.
 * @returns Its first bundle, or `undefined` when the shape is not usable.
 */
const readFirstBundle = (manifest: unknown): ManifestBundle | undefined => {
  if (typeof manifest !== 'object' || manifest === null || !('bundles' in manifest)) {
    return undefined;
  }
  const { bundles } = manifest as { readonly bundles: unknown };
  if (!Array.isArray(bundles)) {
    return undefined;
  }
  const [bundle] = bundles as ReadonlyArray<Partial<ManifestBundle>>;
  if (bundle === undefined) {
    return undefined;
  }
  const { slug, name, version, whenToUse, body } = bundle;
  const usable =
    typeof slug === 'string' &&
    typeof name === 'string' &&
    typeof version === 'string' &&
    typeof whenToUse === 'string' &&
    typeof body === 'string' &&
    body !== '';
  return usable ? { slug, name, version, whenToUse, body } : undefined;
};

/**
 * Load the catalogue with a host's own resolver and reader.
 *
 * A host that cannot resolve a guide simply does not offer that skill: a
 * daemon serving a workspace without the kernel packages installed has no
 * business claiming their guides, and refusing the whole layer over one
 * missing package would be worse than offering the rest.
 *
 * Each resolved subpath names that package's `agent/skills.json`, which carries
 * both the declaration and the rendered body, so one read per package replaces
 * the read-plus-restate this used to do.
 *
 * @param deps - Subpath resolver and text reader, both the host's own.
 * @returns The system-skill entries this host can actually read.
 * @public
 *
 * @example <caption>A daemon over its own module graph</caption>
 * ```typescript
 * import { createRequire } from 'node:module';
 * import { readFile } from 'node:fs/promises';
 * import { loadSystemSkills } from '@taucad/agent-tools/skills';
 *
 * const require = createRequire(import.meta.url);
 * const systemSkills = await loadSystemSkills({
 *   resolve: (subpath) => require.resolve(subpath),
 *   readFile: async (path) => readFile(path, 'utf8'),
 * });
 * ```
 */
export async function loadSystemSkills(deps: {
  readonly resolve: (subpath: string) => string | undefined;
  readonly readFile: (path: string) => Promise<string>;
}): Promise<SystemSkillEntry[]> {
  const loaded = await Promise.all(
    systemSkillCatalog.map(async (entry): Promise<SystemSkillEntry | undefined> => {
      try {
        const path = deps.resolve(entry.subpath);
        if (path === undefined) {
          return undefined;
        }
        const manifest: unknown = JSON.parse(await deps.readFile(path));
        const bundle = readFirstBundle(manifest);
        if (bundle === undefined) {
          return undefined;
        }
        /* Name, version and when-to-use come off the manifest, not off the row
         * beside it: the package that rendered the body is the only thing that
         * knows what it says, so letting the row restate it just creates a
         * second copy to fall out of date. */
        return {
          slug: bundle.slug,
          name: bundle.name,
          version: bundle.version,
          whenToUse: bundle.whenToUse,
          skillMarkdown: bundle.body,
        };
      } catch {
        return undefined;
      }
    }),
  );

  return loaded.filter((entry): entry is SystemSkillEntry => entry !== undefined);
}
