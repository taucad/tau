#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { BundledTypesPackageMap } from '#bundled-types.types.js';

/**
 * Bundle PicoVoxel's declaration graph for Monaco and the generated `cad-picovoxel` skill.
 *
 * PicoVoxel ships hashed declaration chunks (`types-<hash>.d.ts`) that its subpath entries import
 * relatively, so the bundle keeps the relative topology: every author entry plus every chunk it
 * reaches, read recursively. `picovoxel/multi` and `picovoxel/raw` are session internals Tau owns,
 * and `picovoxel/three` needs `three` types Monaco does not mount, so none of them are authoring
 * surface (blueprint Q-C10, R21).
 *
 * Nx cannot hash `node_modules`, so the target's real input is `pnpm-lock.yaml`.
 */

/** Author-facing PicoVoxel export subpaths, `.` first. @public */
export const picovoxelAuthorSubpaths = ['.', './latticelibrary', './numerics', './shapekernel', './slicing'] as const;

/** Relative `from './x.js'` and `import('./x.js')` specifiers in a declaration file. */
const relativeImportPattern = /(?:from\s+|import\s*\(\s*)["'](\.\/[^"']+)\.js["']/gu;

// ponytail: resolved beside the root entry until picovoxel exports `./package.json` (blueprint D13).
const declarationDirectory = (): string => dirname(fileURLToPath(import.meta.resolve('picovoxel')));

const entryFile = (subpath: (typeof picovoxelAuthorSubpaths)[number]): string =>
  subpath === '.' ? 'index.d.ts' : `${subpath.slice(2)}.d.ts`;

/**
 * Read `entries` and every declaration file they reach through relative imports.
 *
 * @param directory - The installed `dist` directory.
 * @param entries - Declaration file names to start from.
 * @returns Every reached declaration file by name, sorted.
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
      pending.push(`${specifier!.slice(2)}.d.ts`);
    }
  }
  return Object.fromEntries([...files].toSorted(([left], [right]) => left.localeCompare(right)));
};

/**
 * Build the package-shaped PicoVoxel declaration bundle.
 *
 * @param directory - The installed `dist` directory; defaults to module resolution of `picovoxel`.
 * @returns The bundle keyed by package name.
 */
export const buildPicovoxelTypes = (directory = declarationDirectory()): BundledTypesPackageMap => {
  const { 'index.d.ts': content, ...files } = collectDeclarationGraph(
    directory,
    picovoxelAuthorSubpaths.map((subpath) => entryFile(subpath)),
  );
  if (content === undefined) {
    throw new Error(`PicoVoxel root declarations are missing from ${directory}.`);
  }
  return {
    picovoxel: {
      content,
      files,
      packageJson: {
        name: 'picovoxel',
        types: './index.d.ts',
        exports: Object.fromEntries(
          picovoxelAuthorSubpaths.map((subpath) => [subpath, { types: `./${entryFile(subpath)}` }]),
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
