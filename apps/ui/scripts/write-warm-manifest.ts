/**
 * Writes the warm manifest (progressive loading PL8, `app/lib/warm-manifest.ts`) into the client build: for each route
 * class the critical-path guards measure, the interactive closure the critical budget measures
 * (`interactive-closure.ts`), less every chunk holding a heavy module family (`critical-path.mts`) and every wasm,
 * worker or runtime asset. Home prefetches the project class's list once idle (`app/lib/warm-next-step.ts`); the
 * marketing site prefetches Home's (`apps/www/src/app-warm.client.ts`).
 *
 * Called from `react-router.config.ts`'s `buildEnd`, after the client build has written `.vite/manifest.json` and the
 * module-id manifest. `scripts/check-critical-budget.mts` checks the written file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuleIdManifest } from '@taucad/vite/module-id-manifest';
/* oxlint-disable no-restricted-imports -- Called from react-router.config.ts before app aliases exist. */
import { criticalRouteClasses, heavyFamilyOfModuleId } from './critical-path.mts';
import type { CriticalRouteClass } from './critical-path.mts';
import { rootKeys, staticClosure } from './interactive-closure.ts';
import type { ViteManifest } from './interactive-closure.ts';
import { isWarmableHref, warmManifestFile, warmManifestVersion } from '../app/lib/warm-manifest.ts';
import type { WarmManifest } from '../app/lib/warm-manifest.ts';
/* oxlint-enable no-restricted-imports */

/**
 * Whether a JavaScript chunk may be prefetched: a chunk the module-id manifest knows that holds no heavy module. A worker
 * or verbatim runtime script is an asset of the build, never a chunk, so it never qualifies.
 *
 * @param file - A chunk of the client build, relative to its directory.
 * @param moduleIds - The module-id manifest.
 * @returns `true` when the chunk may be warmed.
 */
export const isWarmableChunk = (file: string, moduleIds: ModuleIdManifest): boolean => {
  const chunk = moduleIds.chunks.find((candidate) => candidate.fileName === file);
  return chunk?.modules.every((module) => heavyFamilyOfModuleId(module.id) === undefined) === true;
};

/**
 * The files of one class to warm: its interactive closure, less every chunk holding a heavy module and the stylesheets
 * of those chunks, and less every URL the reader would refuse.
 *
 * @param input - The Vite build manifest, the module-id manifest and the class's roots.
 * @returns Root-relative URLs, scripts first.
 */
export const warmFilesOf = (input: {
  manifest: ViteManifest;
  moduleIds: ModuleIdManifest;
  roots: readonly string[];
}): string[] => {
  const { js, css } = staticClosure(input.manifest, rootKeys(input.manifest, input.roots));
  const heavy = new Set(js.filter((file) => !isWarmableChunk(file, input.moduleIds)));
  const heavyStyles = new Set(
    Object.values(input.manifest).flatMap((chunk) => (heavy.has(chunk.file) ? (chunk.css ?? []) : [])),
  );
  return [...js.filter((file) => !heavy.has(file)), ...css.filter((file) => !heavyStyles.has(file))]
    .map((file) => `/${file}`)
    .filter((href) => isWarmableHref(href));
};

/**
 * The warm manifest of a build.
 *
 * @param input - The Vite build manifest, the module-id manifest and the guarded classes.
 * @returns The manifest.
 */
export const buildWarmManifest = (input: {
  manifest: ViteManifest;
  moduleIds: ModuleIdManifest;
  classes: readonly CriticalRouteClass[];
}): WarmManifest => ({
  version: warmManifestVersion,
  classes: Object.fromEntries(
    input.classes.map((routeClass) => [
      routeClass.id,
      warmFilesOf({ manifest: input.manifest, moduleIds: input.moduleIds, roots: routeClass.roots }),
    ]),
  ),
});

/**
 * Write the warm manifest into a client build.
 *
 * @param input - The client build directory and the module-id manifest's path.
 * @returns The manifest written.
 */
export const writeWarmManifest = (input: { clientDirectory: string; moduleIdsPath: string }): WarmManifest => {
  const warm = buildWarmManifest({
    manifest: JSON.parse(readFileSync(join(input.clientDirectory, '.vite', 'manifest.json'), 'utf8')) as ViteManifest,
    moduleIds: JSON.parse(readFileSync(input.moduleIdsPath, 'utf8')) as ModuleIdManifest,
    classes: criticalRouteClasses,
  });
  writeFileSync(join(input.clientDirectory, warmManifestFile), `${JSON.stringify(warm)}\n`);
  return warm;
};
