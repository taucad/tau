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

type BuildablePackage = { project: string; manifest: PackageJson };

/** Package name → its Nx project and manifest, for every package tsdown builds. */
function buildablePackages(configFiles: readonly string[]): Map<string, BuildablePackage> {
  const packages = new Map<string, BuildablePackage>();
  for (const configFile of configFiles) {
    const directory = dirname(configFile);
    const packageJsonPath = join(directory, 'package.json');
    if (basename(configFile) !== 'tsdown.config.ts' || directory === '.' || !existsSync(packageJsonPath)) {
      continue;
    }

    const manifest = readJsonFile<PackageJson>(packageJsonPath);
    const projectJsonPath = join(directory, 'project.json');
    const project = existsSync(projectJsonPath) ? readJsonFile<ProjectConfiguration>(projectJsonPath).name : undefined;
    const name = project ?? manifest.name;
    if (manifest.name !== undefined && name !== undefined) {
      packages.set(manifest.name, { project: name, manifest });
    }
  }

  return packages;
}

/**
 * Every workspace package pkgcheck stages for a strict consumer: the transitive
 * closure of dependencies and peer dependencies. `^build` reaches only direct
 * graph dependencies, and a build without `^build` (a peer-only package such as
 * workbench) stops there, so a transitive peer's `dist` would otherwise be missing.
 */
function stagedProjects(manifest: PackageJson, packages: Map<string, BuildablePackage>): string[] {
  const projects = new Set<string>();
  const pending = [manifest];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const dependency of Object.keys({ ...next.dependencies, ...next.peerDependencies })) {
      const workspacePackage = packages.get(dependency);
      if (workspacePackage && !projects.has(workspacePackage.project)) {
        projects.add(workspacePackage.project);
        pending.push(workspacePackage.manifest);
      }
    }
  }

  return [...projects].toSorted();
}

const createPkgcheckTarget = (
  configFilePath: string,
  context: Parameters<CreateNodesV2[1]>[2],
  packages: Map<string, BuildablePackage>,
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
          pkgcheck: {
            executor: 'nx:run-commands',
            cache: true,
            dependsOn: ['build', '^build', ...(staged.length > 0 ? [{ target: 'build', projects: staged }] : [])],
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
    const packages = buildablePackages(configFiles);

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
