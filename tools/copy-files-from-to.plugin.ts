/**
 * NX Plugin for copy-files-from-to.
 *
 * Used to automatically infer copy-files-from-to targets for all projects.
 */
import { dirname, join } from 'node:path';
import { readJsonFile } from '@nx/devkit';
import type { CreateNodesResult, CreateNodesV2 } from '@nx/devkit';

/** One `from` → `to` copy, with `to` normalised out of its object form. */
export type CopyFilesEntry = { readonly from: string; readonly to: string };

/**
 * Every copy a project's config declares, in declaration order. `readJsonFile`
 * parses JSONC, which the configs use for provenance comments; a config without
 * `copyFiles` throws, and every caller treats that as "no recipe".
 *
 * The pkgcheck `tau-vendored-assets` rule reads the recipes through this
 * function, so the gate and the inferred `copy-assets` target cannot disagree
 * about what a config declares. It lives here rather than in a module of its own
 * because Nx loads this plugin through a CommonJS `require`, which cannot map a
 * relative `./x.js` specifier onto a `.ts` file.
 */
export const readCopyFilesConfig = (configFilePath: string): CopyFilesEntry[] => {
  const json = readJsonFile<{ copyFiles: Array<{ from: string; to: string | { dest: string } }> }>(configFilePath);
  return json.copyFiles.map(({ from, to }) => ({ from, to: typeof to === 'string' ? to : to.dest }));
};

const createCopyTarget = (configFilePath: string): CreateNodesResult | undefined => {
  const projectRoot = dirname(configFilePath);

  if (projectRoot === '.') {
    return undefined;
  }

  const outputs = readCopyFilesConfig(configFilePath).map(({ to }) => join('{projectRoot}', to).replaceAll('\\', '/'));

  const copyAssetsDependsOn = { dependsOn: ['copy-assets', '^copy-assets'] };

  return {
    projects: {
      [projectRoot]: {
        targets: {
          'copy-assets': {
            executor: 'nx:run-commands',
            outputs,
            cache: false,
            options: {
              command: 'copy-files-from-to --when-file-exists overwrite',
              cwd: projectRoot,
            },
          },
          build: copyAssetsDependsOn,
          dev: copyAssetsDependsOn,
          test: copyAssetsDependsOn,
        },
      },
    },
  };
};

export const createNodesV2: CreateNodesV2 = [
  '**/copy-files-from-to.cjson',
  // oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- not necessary as already has an explicit return type
  (configFiles, _options) => {
    const results: Array<[string, CreateNodesResult]> = [];

    for (const configFile of configFiles) {
      try {
        const target = createCopyTarget(configFile);
        if (target) {
          results.push([configFile, target]);
        }
      } catch {
        // ignore
      }
    }

    return results;
  },
];
