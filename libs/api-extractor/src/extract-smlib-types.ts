#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { BundledTypesPackageMap } from '#bundled-types.types.js';

/**
 * Bundle smlibwasm's declaration graph and Tau's SMLib model types for Monaco and the generated
 * `cad-smlib` skill.
 *
 * `@classcad/smlibwasm` ships one flat `dist/` of declarations that import each other with `.ts`
 * specifiers (`from './shapes.ts'`). The bundle keeps that topology, rewritten to `.js` specifiers
 * the editor resolves like any other package, and keeps every file `dist/index.d.ts` reaches. The
 * one Node-only type (`typeof import('node:fs')`, behind the file-path exporters a Tau model cannot
 * call) becomes `any`, because the editor mounts no Node declarations.
 *
 * `@taucad/smlib/model` is the authored return contract (`ShapeConfig`, `Model`, `Material`, …),
 * printed type-only so no runtime host declaration reaches Monaco.
 *
 * Nx cannot hash `node_modules`, so the target's real input is `pnpm-lock.yaml`.
 */

const smlibPackageName = '@classcad/smlibwasm';

/** Relative `from './x.ts'` and `import('./x.ts')` specifiers in a smlibwasm declaration file. */
const relativeImportPattern = /(?:from\s+|import\s*\(\s*)["'](\.{1,2}\/[^"']+)\.ts["']/gu;

/** The Node-only file-system type, which the editor cannot resolve. */
const nodeFsType = "typeof import('node:fs')";

/** The installed package root, found through smlibwasm's exported `./package.json`. */
const packageRoot = (): string => dirname(fileURLToPath(import.meta.resolve(`${smlibPackageName}/package.json`)));

/**
 * Rewrite one declaration file for the editor mount: `.ts` specifiers become `.js`, and the
 * Node file-system type becomes `any`.
 *
 * @param content - The installed declaration text.
 * @returns The declaration as the editor mounts it.
 */
export const rewriteSmlibDeclaration = (content: string): string =>
  content
    .replaceAll(
      /((?:from\s+|import\s*\(\s*)["']\.{1,2}\/[^"']+)\.ts(["'])/gu,
      (_match, prefix: string, quote: string) => `${prefix}.js${quote}`,
    )
    .replaceAll(nodeFsType, 'any');

/**
 * Read `entry` and every declaration file it reaches through relative `.ts` imports.
 *
 * @param directory - The installed `dist` directory.
 * @param entry - Declaration file to start from, relative to `directory`.
 * @returns Every reached declaration file by its POSIX path under `directory`, sorted and rewritten.
 */
export const collectSmlibDeclarations = (directory: string, entry: string): Readonly<Record<string, string>> => {
  const files = new Map<string, string>();
  const pending = [entry];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (files.has(name)) {
      continue;
    }
    const content = readFileSync(join(directory, name), 'utf8');
    files.set(name, rewriteSmlibDeclaration(content));
    for (const [, specifier] of content.matchAll(relativeImportPattern)) {
      const target = posix.join(posix.dirname(name), `${specifier!}.d.ts`);
      if (target.startsWith('../')) {
        throw new Error(`${name} imports ${specifier!}.ts from outside the declaration directory.`);
      }
      pending.push(target);
    }
  }
  return Object.fromEntries([...files].toSorted(([left], [right]) => left.localeCompare(right)));
};

/** Real type-only dependencies of the author model; runtime host declarations stay outside Monaco. */
const authorDeclarations = (): Readonly<Record<string, string>> => {
  const root = join(import.meta.dirname, '../../..');
  const sources = {
    'model.d.ts': 'packages/plugins/smlib/src/model.ts',
    'material.d.ts': 'packages/core/geometry/src/utils/glb-material.ts',
    'json.d.ts': 'libs/types/src/types/json-value.types.ts',
    'gltf.d.ts': 'node_modules/@gltf-transform/core/src/types/gltf.ts',
  };
  const printer = ts.createPrinter();
  return Object.fromEntries(
    Object.entries(sources).map(([name, path]) => {
      const source = ts.createSourceFile(path, readFileSync(join(root, path), 'utf8'), ts.ScriptTarget.Latest, true);
      const content = source.statements
        .filter(
          (statement) =>
            ts.isImportDeclaration(statement) ||
            ts.isExportDeclaration(statement) ||
            ts.isTypeAliasDeclaration(statement) ||
            ts.isInterfaceDeclaration(statement) ||
            ts.isModuleDeclaration(statement),
        )
        .map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, source))
        .join('\n')
        .replaceAll("'@taucad/geometry-core'", "'./material.js'")
        .replaceAll("'@gltf-transform/core'", "'./gltf.js'")
        .replaceAll("'@taucad/runtime/types'", "'./json.js'");
      return [name, content];
    }),
  );
};

/**
 * Build the package-shaped SMLib declaration bundle.
 *
 * @param root - The installed smlibwasm root; defaults to module resolution of its `package.json`.
 * @returns The bundle keyed by package name.
 */
export const buildSmlibTypes = (root = packageRoot()): BundledTypesPackageMap => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    readonly exports?: Readonly<Record<string, unknown>>;
  };
  const rootExport = manifest.exports?.['.'];
  const types =
    typeof rootExport === 'object' && rootExport !== null ? (rootExport as { types?: unknown }).types : undefined;
  // The shared mount always writes a package's `content` to its `index.d.ts`.
  if (types !== './dist/index.d.ts') {
    throw new Error(
      `${smlibPackageName}'s root declarations moved to ${String(types)}; the mount expects ./dist/index.d.ts.`,
    );
  }
  const { 'index.d.ts': content, ...files } = collectSmlibDeclarations(join(root, 'dist'), 'index.d.ts');
  if (content === undefined) {
    throw new Error(`${smlibPackageName} root declarations are missing from ${root}.`);
  }
  return {
    '@taucad/smlib': {
      content: "export type * from './model.js';\n",
      files: authorDeclarations(),
      packageJson: {
        name: '@taucad/smlib',
        type: 'module',
        types: './index.d.ts',
        exports: { '.': { types: './index.d.ts' }, './model': { types: './model.d.ts' } },
      },
    },
    [smlibPackageName]: {
      content,
      files,
      packageJson: {
        name: smlibPackageName,
        type: 'module',
        types: './index.d.ts',
        exports: { '.': { types: './index.d.ts' } },
      },
    },
  };
};

const main = (): void => {
  const outputDirectory = join(import.meta.dirname, 'generated/smlib');
  mkdirSync(outputDirectory, { recursive: true });
  const bundle = buildSmlibTypes();
  writeFileSync(join(outputDirectory, 'smlib.bundled.json'), JSON.stringify(bundle));
  // Per-package declaration trees for the type-level tests (`tsconfig.typetest.json` paths).
  for (const [packageName, { content, files = {} }] of Object.entries(bundle)) {
    for (const [path, declaration] of Object.entries({ 'index.d.ts': content, ...files })) {
      const target = join(outputDirectory, 'modules', packageName, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, declaration);
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
