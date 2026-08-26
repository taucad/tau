import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const runtimeConfigNames = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.lib.json', 'tsconfig.spec.json'] as const;
const ignoredDirectories = new Set([
  '.codex',
  '.git',
  '.nx',
  '.pnpm-store',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'out-tsc',
  'repos',
  'tmp',
]);
const researchDocumentPath = 'docs/research/tsgo-nx-project-reference-guardrails.md';

type ReferenceEntry = {
  path?: unknown;
};

export type TsgoRuntimeReferenceDiagnostic = {
  kind: 'forbidden-reference' | 'parse-error';
  configPath: string;
  projectRoot: string;
  referencePath?: string;
  resolvedPath?: string;
  message: string;
};

export type ValidateTsgoRuntimeReferencesOptions = {
  workspaceRoot: string;
  projectRoots?: readonly string[];
  configNames?: readonly string[];
};

const toWorkspacePath = (options: { workspaceRoot: string; path: string }): string =>
  relative(options.workspaceRoot, options.path).replaceAll('\\', '/');

const isInsideDirectory = (options: { parent: string; child: string }): boolean => {
  const childRelativeToParent = relative(options.parent, options.child);
  return (
    childRelativeToParent === '' || (!childRelativeToParent.startsWith('..') && !isAbsolute(childRelativeToParent))
  );
};

export const discoverProjectRoots = (workspaceRoot: string): string[] => {
  const projectRoots: string[] = [];

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) {
        continue;
      }

      const child = join(directory, entry.name);
      if (existsSync(join(child, 'project.json'))) {
        projectRoots.push(child);
        continue;
      }

      visit(child);
    }
  };

  visit(workspaceRoot);
  return projectRoots.sort((a, b) =>
    toWorkspacePath({ workspaceRoot, path: a }).localeCompare(toWorkspacePath({ workspaceRoot, path: b })),
  );
};

const validateRuntimeConfig = (options: {
  workspaceRoot: string;
  projectRoot: string;
  configPath: string;
}): TsgoRuntimeReferenceDiagnostic[] => {
  const { workspaceRoot, projectRoot, configPath } = options;
  const configText = readFileSync(configPath, 'utf8');
  const configRelativePath = toWorkspacePath({ workspaceRoot, path: configPath });
  const projectRelativePath = toWorkspacePath({ workspaceRoot, path: projectRoot });
  const parsed = ts.parseConfigFileTextToJson(configPath, configText);

  if (parsed.error) {
    const message = ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n');
    return [
      {
        kind: 'parse-error',
        configPath: configRelativePath,
        projectRoot: projectRelativePath,
        message: `${configRelativePath}: failed to parse TypeScript config: ${message}`,
      },
    ];
  }

  const references = (parsed.config as { references?: ReferenceEntry[] } | undefined)?.references;
  if (!Array.isArray(references)) {
    return [];
  }

  return references.flatMap((reference): TsgoRuntimeReferenceDiagnostic[] => {
    if (typeof reference.path !== 'string') {
      return [];
    }

    const resolvedReferencePath = resolve(dirname(configPath), reference.path);
    if (isInsideDirectory({ parent: projectRoot, child: resolvedReferencePath })) {
      return [];
    }

    const resolvedRelativePath = toWorkspacePath({ workspaceRoot, path: resolvedReferencePath });
    return [
      {
        kind: 'forbidden-reference',
        configPath: configRelativePath,
        projectRoot: projectRelativePath,
        referencePath: reference.path,
        resolvedPath: resolvedRelativePath,
        message: `${configRelativePath}: forbidden cross-project reference "${reference.path}" resolves to "${resolvedRelativePath}". Tau runtime configs checked by tsgo must resolve workspace package types through source exports, not referenced out-tsc declarations. Remove the cross-project reference or move declaration generation to a build/publish config. See ${researchDocumentPath}.`,
      },
    ];
  });
};

export const validateTsgoRuntimeReferences = (
  options: ValidateTsgoRuntimeReferencesOptions,
): TsgoRuntimeReferenceDiagnostic[] => {
  const workspaceRoot = resolve(options.workspaceRoot);
  const configNames = new Set(options.configNames ?? runtimeConfigNames);
  const projectRoots = (options.projectRoots ?? discoverProjectRoots(workspaceRoot)).map((projectRoot) =>
    resolve(workspaceRoot, projectRoot),
  );

  return projectRoots.flatMap((projectRoot) =>
    [...configNames].flatMap((configName) => {
      const configPath = join(projectRoot, configName);
      if (!existsSync(configPath)) {
        return [];
      }

      return validateRuntimeConfig({ workspaceRoot, projectRoot, configPath });
    }),
  );
};

export const formatTsgoRuntimeReferenceDiagnostics = (diagnostics: readonly TsgoRuntimeReferenceDiagnostic[]): string =>
  diagnostics.map((diagnostic) => `  \u001B[31mERROR\u001B[0m  ${diagnostic.message}`).join('\n');

export const runTsgoRuntimeReferenceValidation = (workspaceRoot = process.cwd()): number => {
  const diagnostics = validateTsgoRuntimeReferences({ workspaceRoot });

  if (diagnostics.length > 0) {
    console.log('\nForbidden tsgo runtime project references found:\n');
    console.log(formatTsgoRuntimeReferenceDiagnostics(diagnostics));
    console.log(
      `\nSummary: ${diagnostics.length} forbidden cross-project runtime reference${
        diagnostics.length === 1 ? '' : 's'
      } found`,
    );
    return 1;
  }

  console.log('Summary: 0 forbidden cross-project runtime references found');
  return 0;
};

const isDirectRun = (): boolean =>
  process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;

if (isDirectRun()) {
  process.exit(runTsgoRuntimeReferenceValidation());
}
