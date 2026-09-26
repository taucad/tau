import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const repoRoot = resolve(import.meta.dirname, '../../..');

/** Input of {@link emitPackageDeclarations}. */
export type EmitPackageDeclarationsInput = Readonly<{
  /** Package name used in error messages. */
  label: string;
  /** Absolute source directory; the package's `#*` aliases resolve inside it. */
  sourceRoot: string;
  /** Absolute `.ts` entry files whose declarations are emitted. */
  entryPaths: readonly string[];
}>;

type CreateProgramInput = Readonly<{ sourceRoot: string; entryPaths: readonly string[]; outDirectory: string }>;

const createProgram = ({ sourceRoot, entryPaths, outDirectory }: CreateProgramInput): ts.Program =>
  ts.createProgram(entryPaths, {
    allowSyntheticDefaultImports: true,
    declaration: true,
    emitDeclarationOnly: true,
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmitOnError: false,
    outDir: outDirectory,
    rootDir: sourceRoot,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    baseUrl: repoRoot,
    paths: Object.fromEntries([['#*', [join(sourceRoot, '*')]]]),
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

/**
 * Emit the declarations of a workspace package's source tree for the editor's `/node_modules` mount.
 *
 * Package-internal `#` aliases become relative imports. Workspace dependencies resolved through
 * `node_modules` stay bare imports and are not emitted, so each one needs its own bundle.
 *
 * @param input - Package label, source root and entry files.
 * @returns Declaration contents keyed by path relative to the source root.
 */
export function emitPackageDeclarations({
  label,
  sourceRoot,
  entryPaths,
}: EmitPackageDeclarationsInput): Record<string, string> {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'package-dts-'));
  try {
    const program = createProgram({ sourceRoot, entryPaths, outDirectory: temporaryDirectory });
    const emitResult = program.emit(undefined, undefined, undefined, true);
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics];
    const fatalDiagnostics = diagnostics.filter(
      (diagnostic) =>
        diagnostic.category === ts.DiagnosticCategory.Error &&
        diagnostic.file?.fileName.replaceAll('\\', '/').startsWith(sourceRoot.replaceAll('\\', '/')),
    );
    if (fatalDiagnostics.length > 0) {
      throw new Error(`${label} declaration emit failed:\n${formatDiagnostics(fatalDiagnostics)}`);
    }

    return rewriteInternalAliases(collectDeclarationFiles(temporaryDirectory, temporaryDirectory));
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}
