// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/*
 * Application-owned half of two runtime plugin guards. The package-owned halves
 * live in `packages/runtime/src/plugins/plugin-default-export-surface.test.ts`
 * and `packages/runtime/src/testing/browser-import-graph.test.ts`, which scan
 * package roots only — a published package must not read the private
 * application tree. `apps/ui` may read `apps/libs/*`, so it covers all three
 * app roots.
 */
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const pluginPackageNames = readdirSync(resolve(repositoryRoot, 'packages/plugins'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map(
    (entry) =>
      (
        JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/plugins', entry.name, 'package.json'), 'utf8')) as {
          name: string;
        }
      ).name,
  )
  .sort();

const sourceRoots = ['libs/telemetry/src', 'apps/ui/app/middleware', 'apps/ui/app/runtime'] as const;

const pluginImportPrefixes = [
  '#bundler/',
  '#kernels/',
  '#middleware/',
  '@taucad/runtime/bundler',
  '@taucad/runtime/middleware',
  '@taucad/runtime/transcoder',
  ...pluginPackageNames,
];

const collectSourceFiles = (relativeRoot: string): string[] => {
  const files: string[] = [];
  const visit = (absolutePath: string): void => {
    for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
      const child = join(absolutePath, entry.name);
      if (entry.isDirectory()) {
        visit(child);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(relative(repositoryRoot, child));
      }
    }
  };
  visit(resolve(repositoryRoot, relativeRoot));
  return files;
};

const applicationSourceFiles = sourceRoots.flatMap((root) => collectSourceFiles(root));

const isPluginImport = (specifier: string): boolean =>
  pluginImportPrefixes.some((prefix) => specifier === prefix || specifier.startsWith(prefix));

const collectDefaultPluginImportLocations = (relativePath: string): string[] => {
  const sourceFile = ts.createSourceFile(
    relativePath,
    readFileSync(resolve(repositoryRoot, relativePath), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const locations: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.importClause?.name &&
      isPluginImport(node.moduleSpecifier.text)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      locations.push(`${relativePath}:${position.line + 1}:${position.character + 1}`);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return locations;
};

describe('application runtime plugin surface', () => {
  it('should not default-import Tau-owned plugin modules from application source', () => {
    expect(applicationSourceFiles.flatMap((path) => collectDefaultPluginImportLocations(path))).toEqual([]);
  });

  it('should not keep legacy runtime sidecar source files in application source roots', () => {
    const legacySidecarPattern =
      /(?:^|\/)[^/]+\.(?:kernel|middleware|bundler|transcoder)\.js$|(?:^|\/)[^/]+\.(?:module|plugin)\.ts$/;
    const sidecars = sourceRoots
      .flatMap((root) => {
        const files: string[] = [];
        const visit = (absolutePath: string): void => {
          for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
            const child = join(absolutePath, entry.name);
            if (entry.isDirectory()) {
              visit(child);
              continue;
            }
            files.push(relative(repositoryRoot, child));
          }
        };
        visit(resolve(repositoryRoot, root));
        return files;
      })
      .filter((path) => legacySidecarPattern.test(path));

    expect(sidecars).toEqual([]);
  });
});
