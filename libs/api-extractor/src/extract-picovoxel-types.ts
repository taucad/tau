#!/usr/bin/env node

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import type { BundledTypesPackageMap } from '#bundled-types.types.js';

const packageDirectory = join(
  import.meta.dirname,
  '../../../packages/plugins/picovoxel/node_modules/picovoxel',
);

/** Preserve Picovoxel's complete declaration graph and relative chunk topology. */
export const buildPicovoxelTypes = (): BundledTypesPackageMap => {
  const declarationDirectory = join(packageDirectory, 'dist');
  const declarationFiles = readdirSync(declarationDirectory)
    .filter((name) => name.endsWith('.d.ts'))
    .sort();
  const files = Object.fromEntries(
    declarationFiles
      .filter((name) => name !== 'index.d.ts')
      .map((name) => [name, readFileSync(join(declarationDirectory, name), 'utf8')]),
  );
  const subpaths = ['multi', 'latticelibrary', 'numerics', 'raw', 'shapekernel', 'slicing', 'three'];

  return {
    picovoxel: {
      content: readFileSync(join(declarationDirectory, 'index.d.ts'), 'utf8'),
      files,
      packageJson: {
        name: 'picovoxel',
        types: './index.d.ts',
        exports: Object.fromEntries([
          ['.', { types: './index.d.ts' }],
          ...subpaths.map((subpath) => [`./${subpath}`, { types: `./${subpath}.d.ts` }]),
        ]),
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
