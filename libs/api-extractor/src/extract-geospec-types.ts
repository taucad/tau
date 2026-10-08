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

const publicEntries = {
  '.': './index.d.ts',
  './engine': './engine/index.d.ts',
  './mesh': './mesh/index.d.ts',
  './model': './model/index.d.ts',
  './runner': './runner/index.d.ts',
  './runner/native': './runner/native/index.d.ts',
  './runner/worker': './runner/worker/index.d.ts',
  './assertion-client': './assertion-client/index.d.ts',
  './vitest': './vitest/index.d.ts',
  './config': './config/index.d.ts',
  './config/node': './config/node/index.d.ts',
} as const;

const entryPaths = Object.values(publicEntries).map((relativePath) =>
  join(geospecSourceRoot, relativePath.replace(/\.d\.ts$/u, '.ts')),
);

const buildPackageJson = (): Record<string, unknown> => {
  const packageExports: Record<string, { types: string }> = {};
  for (const [specifier, types] of Object.entries(publicEntries)) {
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
