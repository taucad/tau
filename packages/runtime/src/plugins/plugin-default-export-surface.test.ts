// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const pluginPackages = readdirSync(resolve(repositoryRoot, 'packages/plugins'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    name: JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/plugins', entry.name, 'package.json'), 'utf8'))
      .name as string,
    sourceRoot: `packages/plugins/${entry.name}/src`,
  }))
  .sort((left, right) => left.sourceRoot.localeCompare(right.sourceRoot));

const pluginSourceRoots = pluginPackages.map(({ sourceRoot }) => sourceRoot);

/*
 * Package-owned roots only. The application side runs the same guard over its
 * own source in `apps/ui/app/runtime/plugin-source-surface.test.ts`; a
 * published package must not read `apps/**` (see
 * `docs/research/workspace-license-boundary-migration.md`, Finding 2).
 */
const sourceRoots = ['packages/runtime/src', ...pluginSourceRoots] as const;

const pluginImportPrefixes = [
  '#bundler/',
  '#kernels/',
  '#middleware/',
  '@taucad/runtime/bundler',
  '@taucad/runtime/middleware',
  '@taucad/runtime/transcoder',
  ...pluginPackages.map(({ name }) => name),
];

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
      if (
        entry.isFile() &&
        !entry.name.endsWith('.d.ts') &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
      ) {
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
    const defaultExports = pluginSourceRoots
      .flatMap((root) => collectSourceFiles(root))
      .flatMap((path) => collectDefaultExportLocations(readSourceFile(path)));

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

const aliasOf = (packageName: string): string =>
  packageName.replaceAll(/-([a-z0-9])/gu, (_match, character: string) => character.toUpperCase());

const packageNameOf = (sourceRoot: string): string => sourceRoot.split('/')[2] ?? sourceRoot;

/**
 * `[localName, exportedName, moduleSpecifier]` for every named re-export clause
 * in a root barrel.
 */
const collectReExports = (sourceFile: ts.SourceFile): ReadonlyArray<readonly [string, string, string]> =>
  sourceFile.statements.flatMap((statement) => {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.exportClause === undefined ||
      !ts.isNamedExports(statement.exportClause) ||
      statement.moduleSpecifier === undefined ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      return [];
    }
    const specifier = statement.moduleSpecifier.text;
    return statement.exportClause.elements.map(
      (element) => [element.propertyName?.text ?? element.name.text, element.name.text, specifier] as const,
    );
  });

const collectDefinePluginBindings = (sourceFile: ts.SourceFile): readonly string[] =>
  sourceFile.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement) || !hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      return [];
    }
    return statement.declarationList.declarations.flatMap((declaration) => {
      if (
        !ts.isIdentifier(declaration.name) ||
        !declaration.initializer ||
        !ts.isCallExpression(declaration.initializer) ||
        !ts.isIdentifier(declaration.initializer.expression) ||
        declaration.initializer.expression.text !== 'definePlugin'
      ) {
        return [];
      }
      return [declaration.name.text];
    });
  });

const collectNonLiteralKernelAssertions = (sourceFile: ts.SourceFile): readonly string[] => {
  const assertions: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isAsExpression(node) && node.type.getText(sourceFile) !== 'const') {
      assertions.push(`${sourceFile.fileName}: ${node.getText(sourceFile)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return assertions;
};

describe('Tau-owned plugin alias surface', () => {
  it('should declare the package-named binding at definePlugin in every implementation module', () => {
    const actual = pluginSourceRoots.map((root) => {
      const name = packageNameOf(root);
      return `${name}: ${collectDefinePluginBindings(readSourceFile(`${root}/${name}.plugin.ts`)).join(', ')}`;
    });
    const expected = pluginSourceRoots.map((root) => {
      const name = packageNameOf(root);
      return `${name}: ${aliasOf(name)}`;
    });

    expect(actual).toEqual(expected);
  });

  it('should re-export each package-named binding under the dynamic plugin contract', () => {
    const actual = pluginSourceRoots.map((root) => {
      const name = packageNameOf(root);
      const alias = aliasOf(name);
      const bindings = collectReExports(readSourceFile(`${root}/index.ts`))
        .filter(([local]) => local === alias)
        .map(([, exported, specifier]) => `${exported}@${specifier}`);
      return `${name}: ${bindings.join(', ')}`;
    });

    const expected = pluginSourceRoots.map((root) => {
      const name = packageNameOf(root);
      const alias = aliasOf(name);
      return `${name}: ${alias}@#${name}.plugin.js, plugin@#${name}.plugin.js`;
    });

    expect(actual).toEqual(expected);
  });
});

describe('Tau-owned kernel assertion surface', () => {
  it('should keep only the documented rhino3dm declaration adapter', () => {
    const assertions = pluginSourceRoots
      .map((root) => `${root}/${packageNameOf(root)}.kernel.ts`)
      .filter((path) => collectSourceFiles(path.slice(0, path.lastIndexOf('/'))).includes(path))
      .flatMap((path) => collectNonLiteralKernelAssertions(readSourceFile(path)));

    expect(assertions).toEqual([
      'packages/plugins/rhino/src/rhino.kernel.ts: importedFactory as unknown as RhinoFactory',
      'packages/plugins/rhino/src/rhino.kernel.ts: importedFactory as unknown',
    ]);
  });
});
