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
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuleIdManifest } from '@taucad/vite/module-id-manifest';
/* oxlint-disable no-restricted-imports -- Called from react-router.config.ts before app aliases exist. */
import { criticalRouteClasses, heavyFamilyOfModuleId } from './critical-path.mts';
import type { CriticalRouteClass } from './critical-path.mts';
import { rootKeys, staticClosure } from './interactive-closure.ts';
import type { ViteManifest } from './interactive-closure.ts';
import { isSendWarmableHref, isWarmableHref, warmManifestFile, warmManifestVersion } from '../app/lib/warm-manifest.ts';
import { routeClasses } from '../app/lib/route-classes.ts';
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

/** A class's send roots, as the warm manifest's send tier reads them. */
export type SendClass = Readonly<{ id: string; roots: readonly string[]; workers: readonly string[] }>;

/** The classes of the registry that name a send tier. */
export const sendClasses: readonly SendClass[] = routeClasses.flatMap((routeClass) =>
  routeClass.send === undefined
    ? []
    : [{ id: routeClass.id, roots: routeClass.send, workers: routeClass.sendWorkers ?? [] }],
);

/** The relative module files a built chunk imports statically. */
const staticImportsOf = (code: string): string[] =>
  [...code.matchAll(/(?:from|import)\s*["'`]\.\/([\w.~-]+\.js)["'`]/gu)].map((match) => match[1] ?? '');

/** The relative module files a built chunk imports dynamically, by file stem. */
const dynamicImportsOf = (code: string, stems: readonly string[]): string[] =>
  [...code.matchAll(/import\(\s*["'`]\.\/([\w.~-]+\.js)["'`]\s*\)/gu)]
    .map((match) => match[1] ?? '')
    .filter((file) => stems.some((stem) => file.startsWith(`${stem}-`)));

/**
 * The code a worker bundle loads at boot: its entry's static imports, the module it imports to start (its `impl`, by
 * the entry's stem with `.impl` for `.worker`), and their static imports, transitively. Read from the built files,
 * since worker bundles are not in Vite's manifest. The entry file itself is left out.
 *
 * @param assetsDirectory - The client build's `assets` directory.
 * @param workerStem - The entry's file stem, as `agent-host.worker`.
 * @returns Files of the `assets` directory, sorted; empty when the build has no such worker.
 */
export const workerBootFiles = (assetsDirectory: string, workerStem: string): string[] => {
  if (!existsSync(assetsDirectory)) {
    return [];
  }
  const entry = readdirSync(assetsDirectory).find((file) => file.startsWith(`${workerStem}-`) && file.endsWith('.js'));
  if (entry === undefined) {
    return [];
  }
  const implStem = workerStem.replace(/\.worker$/u, '.impl');
  const seen = new Set<string>([entry]);
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || !existsSync(join(assetsDirectory, file))) {
      continue;
    }
    const code = readFileSync(join(assetsDirectory, file), 'utf8');
    const next = [...staticImportsOf(code), ...(file === entry ? dynamicImportsOf(code, [implStem]) : [])];
    for (const imported of next) {
      if (imported !== '' && !seen.has(imported)) {
        seen.add(imported);
        pending.push(imported);
      }
    }
  }
  seen.delete(entry);
  return [...seen].toSorted();
};

/**
 * The send tier of one class (WP-12 step 2): the static closure of its send roots and the boot code of its workers,
 * less the class's interactive files, as root-relative URLs the reader accepts. Heavy families are kept: this tier is
 * fetched on an explicit intent (the composer's first keystroke), not on idle.
 *
 * @param input - The Vite build manifest, the send roots, the worker files and the interactive files to leave out.
 * @returns Root-relative URLs, scripts first.
 */
export const sendFilesOf = (input: {
  manifest: ViteManifest;
  roots: readonly string[];
  workerFiles: readonly string[];
  interactive: readonly string[];
}): string[] => {
  const { js, css } = staticClosure(input.manifest, rootKeys(input.manifest, input.roots));
  const held = new Set(input.interactive);
  const files = [...new Set([...js, ...input.workerFiles.map((file) => `assets/${file}`)])].toSorted();
  return [...files, ...css].map((file) => `/${file}`).filter((href) => !held.has(href) && isSendWarmableHref(href));
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
  send?: readonly SendClass[];
  /** The boot files of a worker bundle, by its entry's stem. */
  workerFiles?: (workerStem: string) => readonly string[];
}): WarmManifest => {
  const classes = Object.fromEntries(
    input.classes.map((routeClass) => [
      routeClass.id,
      warmFilesOf({ manifest: input.manifest, moduleIds: input.moduleIds, roots: routeClass.roots }),
    ]),
  );
  const send = Object.fromEntries(
    (input.send ?? []).map((sendClass) => [
      sendClass.id,
      sendFilesOf({
        manifest: input.manifest,
        roots: sendClass.roots,
        workerFiles: sendClass.workers.flatMap((stem) => input.workerFiles?.(stem) ?? []),
        interactive: classes[sendClass.id] ?? [],
      }),
    ]),
  );
  return { version: warmManifestVersion, classes, ...(Object.keys(send).length === 0 ? {} : { send }) };
};

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
    send: sendClasses,
    workerFiles: (stem) => workerBootFiles(join(input.clientDirectory, 'assets'), stem),
  });
  writeFileSync(join(input.clientDirectory, warmManifestFile), `${JSON.stringify(warm)}\n`);
  return warm;
};
