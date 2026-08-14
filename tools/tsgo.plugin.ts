/**
 * NX Plugin for tsgo (TypeScript Go compiler).
 *
 * Replaces the @nx/js/typescript plugin's typecheck target with tsgo for
 * dramatically faster type-checking. Uses --noEmit mode with composite/declaration
 * disabled to avoid tsgo's stricter declaration serialization limits (TS7056)
 * and non-portable type reference checks (TS2742) that affect complex types
 * like XState machines.
 *
 * Type resolution works through pnpm workspace symlinks and package.json exports
 * pointing to source files, so no declaration emit is needed for type-checking.
 *
 * A project's tsconfigs each become their own command rather than one
 * `&&`-chained string, so a failure in one never hides the diagnostics of
 * another. Build mode (`tsgo -b`) over the solution config would aggregate them
 * natively, but it reintroduces the project-reference problems documented below.
 *
 * Cross-project `references` are intentionally omitted from tsconfig.lib.json and
 * tsconfig.app.json files. With `--composite false`, tsgo does not emit declarations,
 * so referenced projects' `.d.ts` outputs would never exist, causing TS6305 errors.
 * Instead, cross-project types resolve via package.json exports pointing to `.ts`
 * source, which tsgo type-checks directly through pnpm workspace symlinks.
 *
 * @see https://github.com/microsoft/typescript-go/issues/1182 — TS6305 with project references
 * @see https://github.com/microsoft/typescript-go/issues/506 — tsgo and composite project behavior
 */
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { readJsonFile } from '@nx/devkit';
import type { CreateNodesContextV2, CreateNodesResult, CreateNodesV2, ProjectConfiguration } from '@nx/devkit';

/**
 * The input shapes this plugin itself emits. Nx's own `InputDefinition` is a
 * wider union it does not re-export from `@nx/devkit`, so this stays local and
 * describes only what is constructed below — never what is read back.
 */
type InputDefinition = { externalDependencies: string[] };

type PackageJson = {
  nx?: {
    namedInputs?: Record<string, unknown>;
  };
};

type TsgoPluginOptions = {
  /**
   * The name of the target to create.
   * @default 'typecheck'
   */
  targetName?: string;
};

const tsGoFlags = '--noEmit --composite false --declaration false --declarationMap false --incremental';

/**
 * Ordered list of tsconfig files to check for each project.
 * The first one found is used as the primary config for type-checking.
 */
const tsConfigCandidates = ['tsconfig.app.json', 'tsconfig.lib.json'];

/** Only probed for key presence, so the value shape is deliberately opaque. */
function getNamedInputs(directory: string, context: CreateNodesContextV2): Record<string, unknown> {
  const projectJsonPath = join(directory, 'project.json');
  const projectJson: ProjectConfiguration | undefined = existsSync(projectJsonPath)
    ? readJsonFile<ProjectConfiguration>(projectJsonPath)
    : undefined;

  const packageJsonPath = join(directory, 'package.json');
  const packageJson: PackageJson | undefined = existsSync(packageJsonPath)
    ? readJsonFile<PackageJson>(packageJsonPath)
    : undefined;

  return {
    ...context.nxJsonConfiguration.namedInputs,
    ...packageJson?.nx?.namedInputs,
    ...projectJson?.namedInputs,
  };
}

function fileExists(workspaceRoot: string, projectRoot: string, filename: string): boolean {
  return existsSync(join(workspaceRoot, projectRoot, filename));
}

function directoryExists(workspaceRoot: string, projectRoot: string, directoryName: string): boolean {
  return existsSync(join(workspaceRoot, projectRoot, directoryName));
}

function getSourcePatterns(workspaceRoot: string, projectRoot: string): string[] {
  const patterns: string[] = [];
  const sourceDirectories = ['src', 'lib', 'app'];

  for (const directory of sourceDirectories) {
    if (directoryExists(workspaceRoot, projectRoot, directory)) {
      patterns.push(`{projectRoot}/${directory}/**/*.ts`);
      patterns.push(`{projectRoot}/${directory}/**/*.tsx`);
      patterns.push(`{projectRoot}/${directory}/**/*.js`);
      patterns.push(`{projectRoot}/${directory}/**/*.jsx`);
    }
  }

  if (patterns.length === 0) {
    patterns.push('{projectRoot}/**/*.ts');
    patterns.push('{projectRoot}/**/*.tsx');
  }

  return patterns;
}

function getAdditionalInputPatterns(workspaceRoot: string, projectRoot: string): string[] {
  const patterns: string[] = [];

  const viteConfigs = ['vite.config.ts', 'vite.config.js', 'vitest.config.ts', 'vitest.setup.ts'];
  for (const file of viteConfigs) {
    if (fileExists(workspaceRoot, projectRoot, file)) {
      patterns.push(`{projectRoot}/${file}`);
    }
  }

  if (fileExists(workspaceRoot, projectRoot, 'vite-environment.d.ts')) {
    patterns.push('{projectRoot}/vite-environment.d.ts');
  }

  if (directoryExists(workspaceRoot, projectRoot, '.react-router')) {
    patterns.push('{projectRoot}/.react-router/types/**/*');
  }

  if (directoryExists(workspaceRoot, projectRoot, '.source')) {
    patterns.push('{projectRoot}/.source/**/*');
  }

  if (fileExists(workspaceRoot, projectRoot, 'react-router.config.ts')) {
    patterns.push('{projectRoot}/react-router.config.ts');
  }

  if (directoryExists(workspaceRoot, projectRoot, 'tests')) {
    patterns.push('{projectRoot}/tests/**/*.ts');
    patterns.push('{projectRoot}/tests/**/*.tsx');
  }

  return patterns;
}

function getTsConfigInputs(workspaceRoot: string, projectRoot: string): string[] {
  const inputs: string[] = [];
  const tsConfigFiles = [
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.lib.json',
    'tsconfig.spec.json',
    'tsconfig.build.json',
  ];

  for (const file of tsConfigFiles) {
    if (fileExists(workspaceRoot, projectRoot, file)) {
      inputs.push(`{projectRoot}/${file}`);
    }
  }

  return inputs;
}

/**
 * Detect the tsconfig files for a project.
 * Returns the primary config (tsconfig.app.json or tsconfig.lib.json) and
 * optionally tsconfig.spec.json if it exists.
 */
function detectTsConfigs(workspaceRoot: string, projectRoot: string): string[] {
  const configs: string[] = [];

  for (const candidate of tsConfigCandidates) {
    if (fileExists(workspaceRoot, projectRoot, candidate)) {
      configs.push(candidate);
      break;
    }
  }

  if (fileExists(workspaceRoot, projectRoot, 'tsconfig.spec.json')) {
    configs.push('tsconfig.spec.json');
  }

  return configs;
}

const createTsgoTarget = (
  configFilePath: string,
  context: CreateNodesContextV2,
  options: TsgoPluginOptions,
): CreateNodesResult | undefined => {
  const projectRoot = dirname(configFilePath);

  if (projectRoot === '.') {
    return undefined;
  }

  const targetName = options.targetName ?? 'typecheck';
  const { workspaceRoot } = context;

  const tsConfigs = detectTsConfigs(workspaceRoot, projectRoot);
  if (tsConfigs.length === 0) {
    return undefined;
  }

  const namedInputs = getNamedInputs(join(workspaceRoot, projectRoot), context);
  const sourcePatterns = getSourcePatterns(workspaceRoot, projectRoot);
  const tsConfigInputs = getTsConfigInputs(workspaceRoot, projectRoot);
  const additionalInputPatterns = getAdditionalInputPatterns(workspaceRoot, projectRoot);

  // Every tsconfig must report, even when an earlier one fails.
  //
  // `&&` short-circuits, so while the app/lib config had any error the spec
  // config never ran and an entire test suite's type errors stayed invisible.
  // Nx's own `parallel: true` is no better: `ParallelRunningTasks` terminates
  // the sibling processes the moment one exits non-zero, truncating whatever
  // the other was still printing. So the configs are chained with `;` and the
  // failure is accumulated by hand — every config runs to completion, output
  // stays sequential and unmangled, and the target still exits non-zero.
  const checks = tsConfigs.map((config) => `tsgo -p ${config} ${tsGoFlags} || status=1`);
  const command = `${checks.join('; ')}; exit \${status:-0}`;

  const inputs: Array<string | InputDefinition> = [
    '{projectRoot}/package.json',
    '{workspaceRoot}/tsconfig.base.json',
    ...tsConfigInputs,
    ...sourcePatterns,
    ...additionalInputPatterns,
    { externalDependencies: ['@typescript/native-preview'] },
  ];

  if ('production' in namedInputs) {
    inputs.unshift('^production');
  }

  const outputs: string[] = ['{projectRoot}/out-tsc/**/*.tsbuildinfo'];

  return {
    projects: {
      [projectRoot]: {
        targets: {
          [targetName]: {
            executor: 'nx:run-commands',
            cache: true,
            inputs,
            outputs,
            options: {
              command,
              cwd: projectRoot,
            },
          },
        },
      },
    },
  };
};

export const createNodesV2: CreateNodesV2<TsgoPluginOptions> = [
  '**/tsconfig.json',

  (configFiles, options, context) => {
    const results: Array<[string, CreateNodesResult]> = [];
    const pluginOptions = options ?? {};

    for (const configFile of configFiles) {
      try {
        if (configFile.includes('node_modules')) {
          continue;
        }

        const target = createTsgoTarget(configFile, context, pluginOptions);
        if (target) {
          results.push([configFile, target]);
        }
      } catch {
        // Ignore errors for individual projects
      }
    }

    return results;
  },
];
