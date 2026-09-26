#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import type { BundledTypesPackage } from '#bundled-types.types.js';
import { emitPackageDeclarations } from '#emit-package-declarations.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const kinematicsSourceRoot = join(repoRoot, 'packages/kinematics/src');
const spatialSourceRoot = join(repoRoot, 'packages/spatial/src');
const outputDirectory = join(import.meta.dirname, 'generated/kinematics');

/**
 * Mount emitted declarations behind a type-only entry, so the editor rejects a value import
 * (`mechanismSchemaVersion`, a spatial function) that the kernel bundler cannot resolve.
 */
const typeOnlyPackage = (entryFile: string, files: Record<string, string>): BundledTypesPackage => ({
  content: `export type * from './${entryFile.replace(/\.d\.ts$/u, '.js')}';\n`,
  files,
});

/**
 * Build the editor declarations for authoring a mechanism: `@taucad/kinematics` plus the
 * `@taucad/spatial` types it references, both type-only.
 *
 * ponytail: only the type contract (`types.ts`) is published, because a kernel module imports
 * `@taucad/kinematics` for types alone; no kernel registers the package's functions at run time.
 *
 * @returns Declaration bundles keyed by package name.
 */
export function buildKinematicsTypeBundle(): Record<string, BundledTypesPackage> {
  const kinematics = emitPackageDeclarations({
    label: '@taucad/kinematics',
    sourceRoot: kinematicsSourceRoot,
    entryPaths: [join(kinematicsSourceRoot, 'types.ts')],
  });
  const { 'index.d.ts': spatialIndex, ...spatialFiles } = emitPackageDeclarations({
    label: '@taucad/spatial',
    sourceRoot: spatialSourceRoot,
    entryPaths: [join(spatialSourceRoot, 'index.ts')],
  });
  if (kinematics['types.d.ts'] === undefined || spatialIndex === undefined) {
    throw new Error('Kinematics declaration emit did not produce types.d.ts and the spatial index.d.ts.');
  }

  return {
    '@taucad/kinematics': typeOnlyPackage('types.d.ts', kinematics),
    '@taucad/spatial': typeOnlyPackage('entry.d.ts', { ...spatialFiles, 'entry.d.ts': spatialIndex }),
  };
}

function main(): void {
  mkdirSync(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, 'kinematics.bundled.json');
  writeFileSync(outputPath, JSON.stringify(buildKinematicsTypeBundle()));
  console.log(`Kinematics bundled type declarations written to ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
