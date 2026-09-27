#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { emitPackageDeclarations } from '#emit-package-declarations.js';

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
  ['brep/index.d.ts', 'geospec/brep'],
  ['mesh/index.d.ts', 'geospec/mesh'],
  ['model/index.d.ts', 'geospec/model'],
  ['runner/index.d.ts', 'geospec/runner'],
  ['runner/node/index.d.ts', 'geospec/runner/node'],
  ['runner/web/index.d.ts', 'geospec/runner/web'],
  ['runner/worker/index.d.ts', 'geospec/runner/worker'],
  ['step/index.d.ts', 'geospec/step'],
] as const;

const entryPaths = publicEntries.map(([relativePath]) =>
  join(geospecSourceRoot, relativePath.replace(/\.d\.ts$/u, '.ts')),
);

const buildPackageJson = (): Record<string, unknown> => {
  const packageExportEntries = [
    ['.', './index.d.ts'],
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
  const files = emitPackageDeclarations({ label: 'GeoSpec', sourceRoot: geospecSourceRoot, entryPaths });
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
