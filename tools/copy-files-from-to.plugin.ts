/**
 * NX Plugin for copy-files-from-to.
 *
 * Used to automatically infer copy-files-from-to targets for all projects.
 */
import { dirname, join } from 'node:path';
import { readJsonFile } from '@nx/devkit';
import type { CreateNodesResult, CreateNodesV2 } from '@nx/devkit';

const createCopyTarget = (configFilePath: string): CreateNodesResult | undefined => {
  const projectRoot = dirname(configFilePath);

  if (projectRoot === '.') {
    return undefined;
  }

  const json: { copyFiles: Array<{ to: string | { dest: string } }> } = readJsonFile(configFilePath);
  const outputs = json.copyFiles.map((file) => {
    const to = typeof file.to === 'string' ? file.to : file.to.dest;
    return join('{projectRoot}', to).replaceAll('\\', '/');
  });

  return {
    projects: {
      [projectRoot]: {
        targets: {
          'copy-assets': {
            executor: 'nx:run-commands',
            outputs,
            cache: true,
            options: {
              command: 'pnpm copy-files-from-to',
              cwd: projectRoot,
            },
            inputs: [
              '{projectRoot}/copy-files-from-to.cjson',
              {
                externalDependencies: ['copy-files-from-to'],
              },
            ],
          },
        },
      },
    },
  };
};

export const createNodesV2: CreateNodesV2 = [
  '**/copy-files-from-to.cjson',
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- not necessary as already has an explicit return type
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
