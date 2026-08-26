/**
 * The runtime's bundled private libraries, restated synchronously from
 * `packages/runtime/package.json` — shared by the MDX code-block rule (which
 * checks fenced blocks) and `eslint.config.mjs` (which checks the compile-only
 * `.ts` fixtures beside them).
 */

import { existsSync, readFileSync } from 'node:fs';

/** The manifest `bundledLibraryProjects` (`tools/nx/src/resolver.ts`) reads for the runtime. */
const runtimeManifest =
  /** @type {{ devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> }} */ (
    JSON.parse(readFileSync(new URL('../../../packages/runtime/package.json', import.meta.url), 'utf8'))
  );

/**
 * `@taucad/nx`'s `bundledLibraries` rule — a publishable's `workspace:`
 * devDependencies, minus its peers, restricted to private `type:lib` projects —
 * restated without the Nx graph.
 *
 * `workspace()` is async: it reads the cached Nx project graph and builds one
 * when the cache is cold. A lint rule must classify inside `create()`, and this
 * module is evaluated once per ESLint and oxlint process across every lint task
 * in the workspace — building a project graph from inside a lint task Nx itself
 * scheduled is the hazard the restatement exists to avoid.
 *
 * The restatement is not a second source of truth:
 * `rules/validate-mdx-codeblocks.test.js` asserts it equals
 * `bundledLibraries(await workspace(), 'runtime')`.
 *
 * ponytail: a `libs/<name>` sibling stands in for the resolver's private
 * `type:lib` test; import `@taucad/nx` here once it has a synchronous entry point.
 *
 * @public
 */
export const privateRuntimeDocumentPackages = Object.entries(runtimeManifest.devDependencies ?? {})
  .filter(
    ([name, range]) =>
      range.startsWith('workspace:') &&
      !(name in (runtimeManifest.peerDependencies ?? {})) &&
      existsSync(new URL(`../../${name.replace('@taucad/', '')}/package.json`, import.meta.url)),
  )
  .map(([name]) => name);
