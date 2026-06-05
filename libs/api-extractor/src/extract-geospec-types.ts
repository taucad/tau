#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import ts from 'typescript';

type GeneratedPackageTypes = {
  content: string;
  files: Record<string, string>;
  packageJson: Record<string, unknown>;
};

const repoRoot = resolve(import.meta.dirname, '../../..');
const geospecSourceRoot = join(repoRoot, 'packages/geospec/src');
const outputDirectory = join(import.meta.dirname, 'generated/geospec');

const publicEntries = [
  ['index.d.ts', 'geospec'],
  ['config/index.d.ts', 'geospec/config'],
  ['brep/index.d.ts', 'geospec/brep'],
  ['mesh/index.d.ts', 'geospec/mesh'],
  ['model/index.d.ts', 'geospec/model'],
  ['runner/index.d.ts', 'geospec/runner'],
  ['runner/node/index.d.ts', 'geospec/runner/node'],
  ['runner/web/index.d.ts', 'geospec/runner/web'],
  ['runner/worker/index.d.ts', 'geospec/runner/worker'],
  ['step/index.d.ts', 'geospec/step'],
] as const;

const entryFiles = publicEntries.map(([relativePath]) =>
  join(geospecSourceRoot, relativePath.replace(/\.d\.ts$/u, '.ts')),
);

const createProgram = (outDirectory: string): ts.Program =>
  ts.createProgram(entryFiles, {
    allowSyntheticDefaultImports: true,
    declaration: true,
    emitDeclarationOnly: true,
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmitOnError: false,
    outDir: outDirectory,
    rootDir: geospecSourceRoot,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    baseUrl: repoRoot,
    paths: Object.fromEntries([['#*', [join(geospecSourceRoot, '*')]]]),
  });

const formatDiagnostics = (diagnostics: readonly ts.Diagnostic[]): string =>
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => '\n',
  });

const collectDeclarationFiles = (directory: string, root: string): Record<string, string> => {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      Object.assign(files, collectDeclarationFiles(path, root));
      continue;
    }
    if (entry.endsWith('.d.ts')) {
      const relativePath = relative(root, path).replaceAll('\\', '/');
      files[relativePath] = readFileSync(path, 'utf8');
    }
  }
  return files;
};

const relativeImport = (currentFile: string, targetFile: string): string => {
  const currentDirectory = dirname(currentFile);
  const targetJavaScriptFile = targetFile.replace(/\.d\.ts$/u, '.js');
  const relativePath = relative(currentDirectory, targetJavaScriptFile).replaceAll('\\', '/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};

const resolveInternalAlias = (specifier: string): string => specifier.replace(/\.js$/u, '.d.ts');

const rewriteInternalAliases = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(files).map(([file, content]) => [
      file,
      content
        .replaceAll(/from ['"]#([^'"]+)['"]/gu, (_match, specifier: string) => {
          const target = resolveInternalAlias(specifier);
          return `from '${relativeImport(file, target)}'`;
        })
        .replaceAll(/import\(['"]#([^'"]+)['"]\)/gu, (_match, specifier: string) => {
          const target = resolveInternalAlias(specifier);
          return `import('${relativeImport(file, target)}')`;
        }),
    ]),
  );

const buildPackageJson = (): Record<string, unknown> => {
  const packageExportEntries = [
    ['.', './index.d.ts'],
    ['./config', './config/index.d.ts'],
    ['./brep', './brep/index.d.ts'],
    ['./mesh', './mesh/index.d.ts'],
    ['./model', './model/index.d.ts'],
    ['./runner', './runner/index.d.ts'],
    ['./runner/node', './runner/node/index.d.ts'],
    ['./runner/web', './runner/web/index.d.ts'],
    ['./runner/worker', './runner/worker/index.d.ts'],
    ['./step', './step/index.d.ts'],
  ] as const;
  const packageExports: Record<string, { types: string }> = {};
  for (const [specifier, types] of packageExportEntries) {
    packageExports[specifier] = { types };
  }

  return {
    name: 'geospec',
    type: 'module',
    types: 'index.d.ts',
    exports: packageExports,
  };
};

export function buildGeoSpecTypeBundle(): Record<string, GeneratedPackageTypes> {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'geospec-dts-'));
  try {
    const program = createProgram(temporaryDirectory);
    const emitResult = program.emit(undefined, undefined, undefined, true);
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics];
    const fatalDiagnostics = diagnostics.filter(
      (diagnostic) =>
        diagnostic.category === ts.DiagnosticCategory.Error &&
        diagnostic.file?.fileName.replaceAll('\\', '/').startsWith(geospecSourceRoot.replaceAll('\\', '/')),
    );
    if (fatalDiagnostics.length > 0) {
      throw new Error(formatDiagnostics(fatalDiagnostics));
    }

    const files = rewriteInternalAliases(collectDeclarationFiles(temporaryDirectory, temporaryDirectory));
    const rootContent = files['index.d.ts'];
    if (!rootContent) {
      throw new Error('GeoSpec declaration emit did not produce index.d.ts');
    }

    const packageFiles = { ...files };
    delete packageFiles['index.d.ts'];

    return {
      geospec: {
        content: rootContent,
        files: packageFiles,
        packageJson: buildPackageJson(),
      },
    };
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function main(): void {
  mkdirSync(outputDirectory, { recursive: true });
  const bundledTypes = buildGeoSpecTypeBundle();
  const outputPath = join(outputDirectory, 'geospec.bundled.json');
  writeFileSync(outputPath, JSON.stringify(bundledTypes));
  console.log(`GeoSpec bundled type declarations written to ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
