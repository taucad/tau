import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { workspaceRoot } from '@nx/devkit';
import ts from 'typescript';
import { bundledLibraryProjects, workspace } from '#resolver.js';
import type { Workspace, WorkspaceProject } from '#resolver.js';

const declarationPattern = /\.d\.[cm]?ts$/;
const toJsPath = (path: string): string =>
  path
    .replace(/\.d\.mts$/, '.mjs')
    .replace(/\.d\.cts$/, '.cjs')
    .replace(/\.d\.ts$/, '.js');
const toDeclarationPath = (path: string): string =>
  path
    .replace(/\.mjs$/, '.d.mts')
    .replace(/\.cjs$/, '.d.cts')
    .replace(/\.js$/, '.d.ts');
const toPosix = (path: string): string => path.split(sep).join('/');

const declarationFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          return [];
        }
        return declarationFiles(path);
      }
      return declarationPattern.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
};

const moduleLiteral = (node: ts.Node): node is ts.StringLiteralLike =>
  ts.isStringLiteralLike(node) &&
  ((ts.isImportDeclaration(node.parent) && node.parent.moduleSpecifier === node) ||
    (ts.isExportDeclaration(node.parent) && node.parent.moduleSpecifier === node) ||
    (ts.isLiteralTypeNode(node.parent) && ts.isImportTypeNode(node.parent.parent)));

const declarationDependencies = (source: string, importer: string): string[] => {
  const sourceFile = ts.createSourceFile(importer, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const dependencies: string[] = [];
  const visit = (node: ts.Node): void => {
    if (moduleLiteral(node) && node.text.startsWith('.')) {
      dependencies.push(resolve(dirname(importer), toDeclarationPath(node.text)));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return dependencies;
};

const pruneUnreachableBundledDeclarations = async (
  ownerDistribution: string,
  files: readonly string[],
  roots: readonly string[],
): Promise<number> => {
  const bundledRoot = `${join(ownerDistribution, 'libs')}${sep}`;
  const available = new Set(files);
  const reachable = new Set<string>();
  const visit = async (file: string): Promise<void> => {
    if (reachable.has(file)) {
      return;
    }
    reachable.add(file);
    const source = await readFile(file, 'utf8');
    await Promise.all(
      declarationDependencies(source, file)
        .filter((dependency) => available.has(dependency))
        .map(async (dependency) => {
          await visit(dependency);
        }),
    );
  };
  await Promise.all(
    roots.map(async (root) => {
      await visit(root);
    }),
  );

  const unreachable = files.filter((file) => file.startsWith(bundledRoot) && !reachable.has(file));
  await Promise.all(unreachable.map(async (file) => rm(file)));
  return unreachable.length;
};

/**
 * Point bundled private-library declaration specifiers at their mirrored files.
 *
 * @public
 */
export const rewriteDeclarationImports = (
  source: string,
  importer: string,
  targets: ReadonlyMap<string, string>,
): string => {
  const sourceFile = ts.createSourceFile(importer, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const bundledNames = new Set([...targets.keys()].map((name) => name.split('/').slice(0, 2).join('/')));
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  const visit = (node: ts.Node): void => {
    if (moduleLiteral(node)) {
      const target = targets.get(node.text);
      if (target) {
        const path = toPosix(relative(dirname(importer), toJsPath(target)));
        replacements.push({
          start: node.getStart(sourceFile) + 1,
          end: node.getEnd() - 1,
          value: path.startsWith('.') ? path : `./${path}`,
        });
      } else if (bundledNames.has(node.text.split('/').slice(0, 2).join('/'))) {
        throw new Error(`Unmapped bundled declaration import: ${node.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce(
      (text, replacement) => text.slice(0, replacement.start) + replacement.value + text.slice(replacement.end),
      source,
    );
};

type PackageManifest = {
  name: string;
  exports: Record<string, string>;
};

type OwnerPackageManifest = {
  publishConfig?: { exports?: Record<string, { types?: string }> };
};

/**
 * Resolve the private-library declaration closure shipped by a bundle owner.
 *
 * JavaScript bundling follows source imports, but declaration-only imports can
 * introduce an additional private dependency. Those declarations must ship in
 * the owning package too, without pretending the transitive library is a
 * direct development dependency of the package.
 *
 * @public
 */
export const bundledDeclarationProjects = (
  workspaceValue: Workspace,
  projectName: string,
): Array<{ packageName: string; project: WorkspaceProject }> => {
  const byPackageName = new Map(
    workspaceValue.projects.flatMap((project) =>
      project.manifest?.name ? [[project.manifest.name, project] as const] : [],
    ),
  );
  const closure = new Map(
    bundledLibraryProjects(workspaceValue, projectName).map((entry) => [entry.packageName, entry] as const),
  );

  for (const { project } of closure.values()) {
    const dependencies = {
      ...project.manifest?.dependencies,
      ...project.manifest?.optionalDependencies,
    };
    for (const packageName of Object.keys(dependencies)) {
      const dependency = byPackageName.get(packageName);
      if (closure.has(packageName) || dependency?.manifest?.private !== true || !dependency.tags.includes('type:lib')) {
        continue;
      }
      closure.set(packageName, { packageName, project: dependency });
    }
  }

  return [...closure.values()].sort((a, b) => a.packageName.localeCompare(b.packageName));
};

/**
 * Mirror a bundle owner's private-library declarations into its `dist/libs`
 * tree, point its declaration imports at them, and prune mirrors no published
 * declaration reaches. Run from the owner's tsdown `build:done` hook with
 * `deps.dts.neverBundle` set to the owner's {@link bundlePattern}.
 *
 * @public
 */
export const assembleBundledDeclarations = async (
  ownerDirectory: string,
  outDirectory: string,
  projectName: string,
): Promise<void> => {
  const workspaceValue = await workspace();
  const ownerDistribution = resolve(ownerDirectory, outDirectory);
  const targets = new Map<string, string>();
  const ownerManifest = JSON.parse(
    await readFile(join(ownerDirectory, 'package.json'), 'utf8'),
  ) as OwnerPackageManifest;
  const publishedDeclarationRoots = Object.values(ownerManifest.publishConfig?.exports ?? {}).flatMap((entry) =>
    entry.types ? [resolve(ownerDirectory, entry.types)] : [],
  );

  await Promise.all(
    bundledDeclarationProjects(workspaceValue, projectName).map(async ({ project }) => {
      const packageDirectory = join(workspaceRoot, project.root);
      // The bundle rule over-approximates: a candidate that emitted no mirror
      // is simply not bundled here.
      if (!existsSync(join(packageDirectory, 'dist'))) {
        return;
      }

      const manifest = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8')) as PackageManifest;
      const destination = join(ownerDistribution, project.root, 'src');
      const sources = await declarationFiles(join(packageDirectory, 'dist'));
      await Promise.all(
        sources.map(async (source) => {
          const target = join(destination, relative(join(packageDirectory, 'dist'), source));
          await mkdir(dirname(target), { recursive: true });
          await cp(source, target);
        }),
      );

      for (const [subpath, source] of Object.entries(manifest.exports)) {
        const specifier = subpath === '.' ? manifest.name : `${manifest.name}${subpath.slice(1)}`;
        const declaration = source.replace(/^\.\/src\//, '').replace(/\.[cm]?tsx?$/, '.d.mts');
        targets.set(specifier, join(destination, declaration));
      }
    }),
  );

  const files = await declarationFiles(ownerDistribution);
  const rewrittenFiles = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, 'utf8');
      const rewritten = rewriteDeclarationImports(source, file, targets);
      if (rewritten === source) {
        return false;
      }
      await writeFile(file, rewritten);
      return true;
    }),
  );
  const rewrites = rewrittenFiles.filter(Boolean).length;
  const pruned = await pruneUnreachableBundledDeclarations(ownerDistribution, files, publishedDeclarationRoots);
  console.log(`Assembled bundled declarations (${rewrites} files rewritten, ${pruned} unreachable files pruned).`);
};
