/**
 * NX Plugin for tsup.
 *
 * Used to automatically infer tsup targets for all projects.
 */
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { readJsonFile } from '@nx/devkit';
import type {
  CreateNodesContext,
  CreateNodesContextV2,
  CreateNodesResult,
  CreateNodesV2,
  ProjectConfiguration,
} from '@nx/devkit';

type InputDefinition =
  | { input: string; projects: string | string[] }
  | { input: string; dependencies: true }
  | { input: string }
  | { fileset: string }
  | { runtime: string }
  | { externalDependencies: string[] }
  | { dependentTasksOutputFiles: string; transitive?: boolean }
  | { env: string };

type PackageJson = {
  nx?: {
    namedInputs?: Record<string, Array<string | InputDefinition>>;
  };
};

/**
 * Get the named inputs available for a project.
 *
 * Copied from NX source code as it's not available in the @nx/devkit exports.
 */
export function getNamedInputs(
  directory: string,
  context: CreateNodesContext | CreateNodesContextV2,
): Record<string, Array<string | InputDefinition>> {
  const projectJsonPath = join(directory, 'project.json');
  const projectJson: ProjectConfiguration | undefined = existsSync(projectJsonPath)
    ? readJsonFile<ProjectConfiguration>(projectJsonPath)
    : undefined;

  const packageJsonPath = join(directory, 'package.json');
  const packageJson: PackageJson | undefined = existsSync(packageJsonPath) ? readJsonFile(packageJsonPath) : undefined;

  return {
    ...context.nxJsonConfiguration.namedInputs,
    ...packageJson?.nx?.namedInputs,
    ...projectJson?.namedInputs,
  };
}

const createTsupTarget = (configFilePath: string, context: CreateNodesContextV2): CreateNodesResult | undefined => {
  const projectRoot = dirname(configFilePath);

  if (projectRoot === '.') {
    return undefined;
  }

  const namedInputs = getNamedInputs(projectRoot, context);

  return {
    projects: {
      [projectRoot]: {
        targets: {
          build: {
            executor: 'nx:run-commands',
            outputs: ['{projectRoot}/dist'],
            cache: true,
            options: {
              command: 'tsup',
              cwd: projectRoot,
            },
            inputs: [
              ...('production' in namedInputs ? ['default', '^production'] : ['default', '^default']),
              {
                externalDependencies: ['tsup'],
              },
              {
                env: 'CI',
              },
            ],
          },
        },
      },
    },
  };
};

export const createNodesV2: CreateNodesV2 = [
  '**/tsup.config.ts',
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- not necessary as already has an explicit return type
  (configFiles, _options, context) => {
    const results: Array<[string, CreateNodesResult]> = [];

    for (const configFile of configFiles) {
      const target = createTsupTarget(configFile, context);
      if (target) {
        results.push([configFile, target]);
      }
    }

    return results;
  },
];
