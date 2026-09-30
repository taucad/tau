#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { BundledTypesPackageMap } from '#bundled-types.types.js';

/**
 * Bundle PicoVoxel's declaration graph for Monaco and the generated `cad-picovoxel` skill.
 *
 * PicoVoxel ships unbundled declarations that mirror its sources (`dist/session.d.ts`,
 * `dist/shapekernel/basePipe.d.ts`, …) and import each other relatively, across directories too
 * (`../numerics/frame.js`). The bundle keeps that topology: every author entry plus every file it
 * reaches, keyed by its path under `dist/`. `picovoxel/multi` and `picovoxel/raw` are session
 * internals Tau owns, and `picovoxel/three` needs `three` types Monaco does not mount, so none of
 * them are authoring surface (blueprint Q-C10, R21).
 *
 * Nx cannot hash `node_modules`, so the target's real input is `pnpm-lock.yaml`.
 */

/** Author-facing PicoVoxel export subpaths, `.` first. @public */
export const picovoxelAuthorSubpaths = ['.', './latticelibrary', './numerics', './shapekernel', './slicing'] as const;

type PicovoxelAuthorSubpath = (typeof picovoxelAuthorSubpaths)[number];

/** Relative `from './x.js'`, `from '../y/x.js'` and `import('./x.js')` specifiers in a declaration file. */
const relativeImportPattern = /(?:from\s+|import\s*\(\s*)["'](\.{1,2}\/[^"']+)\.js["']/gu;

type PicovoxelManifest = Readonly<{
  exports: Readonly<Record<string, Readonly<{ import?: Readonly<{ types?: string }> }> | string>>;
}>;

/** The installed package root, found through picovoxel's exported `./package.json` (blueprint D13). */
const packageRoot = (): string => dirname(fileURLToPath(import.meta.resolve('picovoxel/package.json')));

/** Real type-only dependencies of the author model; runtime host declarations stay outside Monaco. */
const authorDeclarations = (): Readonly<Record<string, string>> => {
  const root = join(import.meta.dirname, '../../..');
  const sources = {
    'model.d.ts': 'packages/plugins/picovoxel/src/model.ts',
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
 * Each author subpath's declaration entry, relative to `dist/`, read from the installed exports map.
 *
 * @param root - The installed package root.
 * @returns The entry file per author subpath.
 */
const authorEntries = (root: string): Readonly<Record<PicovoxelAuthorSubpath, string>> => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PicovoxelManifest;
  const entries = picovoxelAuthorSubpaths.map((subpath) => {
    const target = manifest.exports[subpath];
    const types = typeof target === 'object' ? target.import?.types : undefined;
    if (!types?.startsWith('./dist/')) {
      throw new Error(`picovoxel exports no ESM declaration under dist/ for ${subpath}.`);
    }
    return [subpath, types.slice('./dist/'.length)] as const;
  });
  return Object.fromEntries(entries) as Record<PicovoxelAuthorSubpath, string>;
};

/**
 * Read `entries` and every declaration file they reach through relative imports.
 *
 * A specifier resolves against the file that imports it, so nested directories and `../` climbs
 * land on the file TypeScript would load. A specifier that climbs out of `directory` is refused.
 *
 * @param directory - The installed `dist` directory.
 * @param entries - Declaration files to start from, relative to `directory`.
 * @returns Every reached declaration file by its POSIX path under `directory`, sorted.
 */
export const collectDeclarationGraph = (
  directory: string,
  entries: readonly string[],
): Readonly<Record<string, string>> => {
  const files = new Map<string, string>();
  const pending = [...entries];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (files.has(name)) {
      continue;
    }
    const content = readFileSync(join(directory, name), 'utf8');
    files.set(name, content);
    for (const [, specifier] of content.matchAll(relativeImportPattern)) {
      const target = posix.join(posix.dirname(name), `${specifier!}.d.ts`);
      if (target.startsWith('../')) {
        throw new Error(`${name} imports ${specifier!}.js from outside the declaration directory.`);
      }
      pending.push(target);
    }
  }
  return Object.fromEntries([...files].toSorted(([left], [right]) => left.localeCompare(right)));
};

/**
 * Build the package-shaped PicoVoxel declaration bundle.
 *
 * @param root - The installed package root; defaults to module resolution of `picovoxel/package.json`.
 * @returns The bundle keyed by package name.
 */
export const buildPicovoxelTypes = (root = packageRoot()): BundledTypesPackageMap => {
  const entries = authorEntries(root);
  // The shared mount always writes a package's `content` to its `index.d.ts`.
  if (entries['.'] !== 'index.d.ts') {
    throw new Error(`picovoxel's root declarations moved to dist/${entries['.']}; the mount expects dist/index.d.ts.`);
  }
  const { 'index.d.ts': content, ...files } = collectDeclarationGraph(join(root, 'dist'), Object.values(entries));
  if (content === undefined) {
    throw new Error(`PicoVoxel root declarations are missing from ${root}.`);
  }
  return {
    '@taucad/picovoxel': {
      content:
        "export type { PicovoxelPart, PicovoxelModel, PicovoxelResult, Material, Image, Resources } from './model.js';\n",
      files: authorDeclarations(),
      packageJson: {
        name: '@taucad/picovoxel',
        types: './index.d.ts',
        exports: { '.': { types: './index.d.ts' } },
      },
    },
    picovoxel: {
      content,
      files,
      packageJson: {
        name: 'picovoxel',
        types: './index.d.ts',
        exports: Object.fromEntries(
          picovoxelAuthorSubpaths.map((subpath) => [subpath, { types: `./${entries[subpath]}` }]),
        ),
      },
    },
  };
};

const main = (): void => {
  const outputDirectory = join(import.meta.dirname, 'generated/picovoxel');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, 'picovoxel.bundled.json'), JSON.stringify(buildPicovoxelTypes()));
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
