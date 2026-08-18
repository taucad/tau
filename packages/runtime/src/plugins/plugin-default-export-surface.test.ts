// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const pluginImplementationFiles = [
  'packages/runtime/src/bundler/esbuild.bundler.ts',
  'packages/runtime/src/transcoders/converter/converter.transcoder.ts',
  'packages/runtime/src/kernels/replicad/replicad.kernel.ts',
  'packages/runtime/src/kernels/jscad/jscad.kernel.ts',
  'packages/runtime/src/kernels/manifold/manifold.kernel.ts',
  'packages/runtime/src/kernels/opencascade/opencascade.kernel.ts',
  'packages/runtime/src/kernels/tau/tau.kernel.ts',
  'packages/runtime/src/kernels/zoo/zoo.kernel.ts',
  'packages/kernels/openrscad/src/openrscad.kernel.ts',
] as const;

/*
 * Package-owned roots only. The application side runs the same guard over its
 * own source in `apps/ui/app/runtime/plugin-default-export-surface.test.ts`; a
 * published package must not read `apps/**` (see
 * `docs/research/workspace-license-boundary-migration.md`, Finding 2).
 */
const sourceRoots = ['packages/runtime/src', 'packages/kernels/openrscad/src'] as const;

const pluginImportPrefixes = [
  '#bundler/',
  '#kernels/',
  '#middleware/',
  '#transcoders/',
  '@taucad/runtime/bundler',
  '@taucad/runtime/kernels',
  '@taucad/runtime/middleware',
  '@taucad/runtime/transcoder',
  '@taucad/openrscad',
] as const;

const readSourceFile = (relativePath: string): ts.SourceFile => {
  const absolutePath = resolve(repositoryRoot, relativePath);
  const source = readFileSync(absolutePath, 'utf8');
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
};

const parseSource = (fileName: string, source: string): ts.SourceFile =>
  ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const positionOf = (sourceFile: ts.SourceFile, node: ts.Node): string => {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}`;
};

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);

const collectDefaultExportLocations = (sourceFile: ts.SourceFile): readonly string[] => {
  const locations: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      locations.push(positionOf(sourceFile, node));
    }

    if (hasModifier(node, ts.SyntaxKind.ExportKeyword) && hasModifier(node, ts.SyntaxKind.DefaultKeyword)) {
      locations.push(positionOf(sourceFile, node));
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return locations;
};

const collectSourceFiles = (relativeRoot: string): readonly string[] => {
  const absoluteRoot = resolve(repositoryRoot, relativeRoot);
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

  visit(absoluteRoot);
  return files;
};

const isPluginImport = (specifier: string): boolean =>
  pluginImportPrefixes.some((prefix) => specifier === prefix || specifier.startsWith(prefix));

const collectDefaultPluginImportLocations = (sourceFile: ts.SourceFile): readonly string[] => {
  const locations: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause?.name) {
      const specifier = node.moduleSpecifier.text;
      if (isPluginImport(specifier)) {
        locations.push(positionOf(sourceFile, node));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return locations;
};

describe('Tau-owned plugin export surface', () => {
  it('should keep first-party plugin implementation modules named-only', () => {
    const defaultExports = pluginImplementationFiles.flatMap((path) =>
      collectDefaultExportLocations(readSourceFile(path)),
    );

    expect(defaultExports).toEqual([]);
  });

  it('should not default-import Tau-owned plugin modules from source files', () => {
    const defaultImports = sourceRoots
      .flatMap((root) => collectSourceFiles(root))
      .flatMap((path) => collectDefaultPluginImportLocations(readSourceFile(path)));

    expect(defaultImports).toEqual([]);
  });

  it('should keep CAD user source default entrypoints outside the plugin guard scope', () => {
    const cadSource = parseSource(
      'main.ts',
      [
        'export const defaultParams = { radius: 10 };',
        'export default function main(params = defaultParams) {',
        '  return makeCylinder(params.radius);',
        '}',
      ].join('\n'),
    );

    expect(collectDefaultExportLocations(cadSource)).toEqual(['main.ts:2:1']);
  });
});
