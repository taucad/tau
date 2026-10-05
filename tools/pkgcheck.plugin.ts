/**
 * NX Plugin for pkgcheck.
 *
 * Used to automatically infer pkgcheck targets for all publishable packages.
 * Discovers packages by looking for tsdown.config.ts (the build tool for publishable packages).
 */
import { basename, dirname, join } from 'node:path';
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
  name?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  nx?: {
    namedInputs?: Record<string, Array<string | InputDefinition>>;
  };
};

function getNamedInputs(
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

type BuiltPackage = { project: string; manifest: PackageJson };

/** Package name → Nx project and manifest, for every package that tsdown builds. */
function readBuiltPackages(configFiles: readonly string[]): Map<string, BuiltPackage> {
  const packages = new Map<string, BuiltPackage>();
  for (const configFile of configFiles) {
    const directory = dirname(configFile);
    const packageJsonPath = join(directory, 'package.json');
    const projectJsonPath = join(directory, 'project.json');
    if (directory === '.' || !existsSync(packageJsonPath) || !existsSync(projectJsonPath)) {
      continue;
    }

    const manifest = readJsonFile<PackageJson>(packageJsonPath);
    const { name } = readJsonFile<ProjectConfiguration>(projectJsonPath);
    if (manifest.name !== undefined && name !== undefined) {
      packages.set(manifest.name, { project: name, manifest });
    }
  }

  return packages;
}

/**
 * The projects whose dist pkgcheck stages: every built workspace package reachable
 * through `dependencies` and `peerDependencies`. `^build` alone reaches only direct
 * dependencies, and a build without its own `^build` (workbench, three) leaves the
 * peers it names unbuilt. Development dependencies are not followed; they form cycles.
 */
function stagedProjects(manifest: PackageJson, packages: Map<string, BuiltPackage>): string[] {
  const seen = new Set<string>();
  const pending = [manifest];
  for (let current = pending.pop(); current; current = pending.pop()) {
    for (const dependency of [
      ...Object.keys(current.dependencies ?? {}),
      ...Object.keys(current.peerDependencies ?? {}),
    ]) {
      const built = packages.get(dependency);
      if (built && dependency !== manifest.name && !seen.has(built.project)) {
        seen.add(built.project);
        pending.push(built.manifest);
      }
    }
  }

  return [...seen].toSorted();
}

const createPkgcheckTarget = (
  configFilePath: string,
  context: Parameters<CreateNodesV2[1]>[2],
  packages: Map<string, BuiltPackage>,
): CreateNodesResult | undefined => {
  const projectRoot = dirname(configFilePath);

  if (projectRoot === '.') {
    return undefined;
  }

  const packageJsonPath = join(projectRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return undefined;
  }

  const packageJson = readJsonFile<PackageJson>(packageJsonPath);
  if (packageJson.private === true) {
    return undefined;
  }

  const namedInputs = getNamedInputs(projectRoot, context);
  const staged = stagedProjects(packageJson, packages);

  return {
    projects: {
      [projectRoot]: {
        targets: {
          'pkgcheck-deps': {
            executor: 'nx:noop',
            dependsOn: staged.length > 0 ? [{ target: 'build', projects: staged }] : [],
          },
          pkgcheck: {
            executor: 'nx:run-commands',
            cache: true,
            dependsOn: ['build', '^build', 'pkgcheck-deps'],
            options: {
              command: `tsx tools/pkgcheck.ts ${projectRoot}`,
              cwd: '.',
            },
            inputs: [
              ...('production' in namedInputs ? ['default', '^production'] : ['default', '^default']),
              '{projectRoot}/package.json',
              '{projectRoot}/tsdown.config.ts',
              '{projectRoot}/dist/**/*',
              {
                externalDependencies: ['publint', '@arethetypeswrong/cli', 'madge'],
              },
            ],
          },
        },
      },
    },
  };
};

const createSizeTarget = (configFilePath: string): CreateNodesResult | undefined => {
  const projectRoot = dirname(configFilePath);
  return projectRoot === '.'
    ? undefined
    : {
        projects: {
          [projectRoot]: {
            targets: {
              size: {
                executor: 'nx:run-commands',
                cache: true,
                dependsOn: ['build'],
                options: { command: 'size-limit', cwd: projectRoot },
                inputs: [
                  '{projectRoot}/.size-limit.json',
                  '{projectRoot}/dist/**/*',
                  { externalDependencies: ['size-limit'] },
                ],
              },
            },
          },
        },
      };
};

export const createNodesV2: CreateNodesV2 = [
  '**/{tsdown.config.ts,.size-limit.json}',
  // oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- not necessary as already has an explicit return type
  (configFiles, _options, context) => {
    const results: Array<[string, CreateNodesResult]> = [];
    const packages = readBuiltPackages(configFiles.filter((configFile) => basename(configFile) === 'tsdown.config.ts'));

    for (const configFile of configFiles) {
      const target =
        basename(configFile) === '.size-limit.json'
          ? createSizeTarget(configFile)
          : createPkgcheckTarget(configFile, context, packages);
      if (target) {
        results.push([configFile, target]);
      }
    }

    return results;
  },
];
