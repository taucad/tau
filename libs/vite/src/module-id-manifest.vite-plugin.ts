import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * One module inside a chunk: its id relative to the manifest root and the bytes Rolldown rendered for it.
 *
 * @public
 */
export type ModuleIdManifestModule = {
  readonly id: string;
  readonly renderedLength: number;
};

/**
 * One JavaScript chunk of the client build.
 *
 * @public
 */
export type ModuleIdManifestChunk = {
  readonly fileName: string;
  readonly isEntry: boolean;
  readonly isDynamicEntry: boolean;
  readonly facadeModuleId: string | undefined;
  readonly imports: readonly string[];
  readonly dynamicImports: readonly string[];
  readonly modules: readonly ModuleIdManifestModule[];
};

/**
 * One emitted asset: workers, wasm, styles and other files that are not JavaScript chunks.
 *
 * @public
 */
export type ModuleIdManifestAsset = {
  readonly fileName: string;
  readonly sources: readonly string[];
};

/**
 * The file {@link moduleIdManifest} writes.
 *
 * @public
 */
export type ModuleIdManifest = {
  readonly schema: 'tau-module-id-manifest-v1';
  readonly chunks: readonly ModuleIdManifestChunk[];
  readonly assets: readonly ModuleIdManifestAsset[];
};

/**
 * Options for {@link moduleIdManifest}.
 *
 * @public
 */
export type ModuleIdManifestOptions = {
  /** Absolute path of the JSON file to write. Keep it outside the published directory. */
  readonly outFile: string;
  /** Directory module ids are made relative to, normally the workspace root. */
  readonly root: string;
};

const byString = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const relativeId = (root: string, id: string): string => {
  const normalized = id.replace(/^\0/u, '').replaceAll('\\', '/');
  const prefix = `${root.replaceAll('\\', '/').replace(/\/$/u, '')}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
};

/**
 * Write the module ids of every client chunk, with the bytes each module rendered, so a check on the build output
 * can attribute a chunk's bytes to the modules (and the packages) inside it.
 *
 * Vite's `.vite/manifest.json` names a chunk's source entry and its imports, not the modules a bundler merged into
 * it, so a package reached through another package, or a module folded into a shared chunk, is invisible there.
 * The manifest is written beside the build, never into the published client directory. It runs for the client
 * environment of a build only; workers are separate bundles and appear as assets.
 *
 * @param options - Where to write the manifest and the root module ids are relative to.
 * @returns The plugin.
 * @public
 */
export function moduleIdManifest(options: ModuleIdManifestOptions): Plugin {
  let manifest: ModuleIdManifest | undefined;
  let viteRoot = options.root;
  return {
    name: 'vite:module-id-manifest',
    apply: 'build',
    applyToEnvironment: (environment) => environment.config.consumer === 'client',
    configResolved(config) {
      viteRoot = config.root;
    },
    generateBundle(_outputOptions, bundle) {
      const outputs = Object.values(bundle);
      const chunks = outputs
        .filter((output) => output.type === 'chunk')
        .map((chunk) => ({
          fileName: chunk.fileName,
          isEntry: chunk.isEntry,
          isDynamicEntry: chunk.isDynamicEntry,
          facadeModuleId: chunk.facadeModuleId ? relativeId(options.root, chunk.facadeModuleId) : undefined,
          imports: chunk.imports.toSorted(byString),
          dynamicImports: chunk.dynamicImports.toSorted(byString),
          modules: Object.entries(chunk.modules)
            .map(([id, info]) => ({ id: relativeId(options.root, id), renderedLength: info.renderedLength }))
            .toSorted((left, right) => byString(left.id, right.id)),
        }))
        .toSorted((left, right) => byString(left.fileName, right.fileName));
      const assets = outputs
        .filter((output) => output.type === 'asset')
        .map((asset) => ({
          fileName: asset.fileName,
          sources: asset.originalFileNames.map((source) => relativeId(options.root, path.resolve(viteRoot, source))),
        }))
        .toSorted((left, right) => byString(left.fileName, right.fileName));
      manifest = { schema: 'tau-module-id-manifest-v1', chunks, assets };
    },
    async writeBundle() {
      if (manifest === undefined) {
        return;
      }
      await mkdir(path.dirname(options.outFile), { recursive: true });
      await writeFile(options.outFile, `${JSON.stringify(manifest)}\n`);
    },
  };
}
