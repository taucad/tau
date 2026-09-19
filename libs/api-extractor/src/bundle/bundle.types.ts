/**
 * The `agent/skills.json` manifest every skill-owning package declares.
 *
 * This file is what makes the catalogue derived rather than enumerated. The
 * previous design listed nine skills and nine `@taucad/<plugin>/agent` subpaths
 * in one hand-maintained literal, so a package that was not in the literal could
 * not contribute a skill however complete its bundle, and a package that was in
 * it was advertised whether or not the host could resolve it.
 *
 * @module
 */

/** One bundle a package ships. @public */
export type SkillBundleDeclaration = {
  /** Skill name as an agent activates it, e.g. `cad-replicad`. */
  readonly slug: string;
  /** Human-readable title for catalogues. */
  readonly name: string;
  /** Always-loaded. Capped at 160 characters by the budget gate. */
  readonly description: string;
  readonly version: string;
  /** One line telling the model when activation is the right move. */
  readonly whenToUse: string;
  /** Directory holding the bundle, relative to the manifest. */
  readonly directory: string;
  /** Every file in the bundle, relative to `directory`. `SKILL.md` is always first. */
  readonly files: readonly string[];
  /**
   * The rendered `SKILL.md`, verbatim, frontmatter included.
   *
   * Inline so that one `import … with { type: 'json' }` is the whole eager tier:
   * a JSON module resolves identically under Node and under a bundler, where
   * `?raw` is bundler-only and forced Vite's `fs.allow` open to the workspace
   * root. It is only the T1 body — bounded at 800 tokens by the budget gate —
   * so the index and shards stay files, fetched when something actually greps
   * them. That is the tiering working, not a shortcut around it.
   *
   * It duplicates `SKILL.md` on disk, which a non-JS host needs; the
   * regeneration test compares the whole bundle byte for byte, so the two
   * cannot drift without CI going red.
   */
  readonly body: string;
};

/**
 * A package's skill declaration.
 *
 * `null` with a reason is a first-class answer. Silence is not: the declaration
 * gate requires every plugin and every skill-bearing package to say one or the
 * other, so a new plugin cannot arrive without a skill decision and a transcoder
 * is never mistaken for a kernel someone forgot.
 *
 * @public
 */
export type TauSkillsManifest = {
  readonly bundles: readonly SkillBundleDeclaration[];
};

/**
 * A package's answer to "do you ship a skill?", parsed.
 *
 * On disk the field is `"skills": "./agent/skills.json"` or `"skills": null`
 * with a `reason`. In TypeScript it is a tagged union, because the gate has to
 * tell "declares none, here is why" from "forgot to declare" — and a nullable
 * path collapses both onto the same absent value.
 *
 * @public
 */
export type TauSkillsDeclaration =
  | { readonly kind: 'manifest'; readonly path: string }
  | { readonly kind: 'none'; readonly reason: string };

/** The `tau` field of a `package.json`, parsed. @public */
export type TauPackageDeclaration = {
  readonly skills: TauSkillsDeclaration;
};

/**
 * Parse the `tau` field of a parsed `package.json`.
 *
 * Takes `unknown` rather than a typed shape: the input is whatever `JSON.parse`
 * returned, and the gate's whole job is to reject packages whose declaration is
 * missing or malformed. A `null` with no `reason` is malformed, not "none".
 *
 * @param tau - The `tau` field, as parsed from JSON.
 * @returns The declaration, or `undefined` when the package has not declared one.
 * @public
 *
 * @example <caption>A package that ships one</caption>
 * ```typescript
 * import { parseTauSkills } from '@taucad/api-extractor';
 *
 * parseTauSkills({ skills: './agent/skills.json' });
 * // { kind: 'manifest', path: './agent/skills.json' }
 * ```
 */
export const parseTauSkills = (tau: unknown): TauSkillsDeclaration | undefined => {
  if (typeof tau !== 'object' || tau === null || !('skills' in tau)) {
    return undefined;
  }
  const { skills } = tau as { readonly skills: unknown };
  if (typeof skills === 'string' && skills !== '') {
    return { kind: 'manifest', path: skills };
  }
  if (skills !== undefined && skills !== null) {
    return undefined;
  }
  const { reason } = tau as { readonly reason?: unknown };
  return typeof reason === 'string' && reason !== '' ? { kind: 'none', reason } : undefined;
};

/** Manifest filename, relative to a package's `agent/` directory. @public */
export const skillsManifestFile = 'skills.json';

/** The skill body filename inside every bundle. @public */
export const skillBodyFile = 'SKILL.md';

/** The authored doctrine filename, beside the manifest in the owning package. @public */
export const doctrineFile = 'doctrine.md';

/** The T2 index filename inside a corpus-backed bundle. @public */
export const apiIndexFile = 'api-index.md';
