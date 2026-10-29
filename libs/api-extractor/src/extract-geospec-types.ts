#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

/**
 * Bundle the installed `geospec` package's declarations for the TypeScript service.
 *
 * `geospec` is published from taucad/geospec and installed here at its pnpm catalog pin. Its tarball ships
 * unbundled declarations under `dist/` (`dist/index.d.mts`, `dist/model/types.d.mts`, …) that import each other
 * relatively. The bundle keeps that topology under `.d.ts` names, with each relative `.mjs` specifier read as
 * `.js`, and points every public subpath's `types` at its entry.
 *
 * Nx cannot hash `node_modules`, so the target's real input is `pnpm-lock.yaml`.
 */

type GeneratedPackageTypes = {
  content: string;
  files: Record<string, string>;
  packageJson: Record<string, unknown>;
};

type InstalledManifest = Readonly<{
  name: string;
  exports: Readonly<Record<string, Readonly<{ types?: string }> | string>>;
}>;

const repoRoot = resolve(import.meta.dirname, '../../..');
const outputDirectory = join(import.meta.dirname, 'generated/geospec');

/** Relative `from './x.mjs'` and `import('../y/x.mjs')` specifiers in a declaration file. */
const relativeImportPattern = /((?:from\s+|import\s*\(\s*)["']\.{1,2}\/[^"']+)\.mjs(["'])/gu;

/** The installed package root, through the workspace root's `geospec` dependency. */
const packageRoot = (): string => realpathSync(join(repoRoot, 'node_modules/geospec'));

/** A path under `dist/` as the bundle names it: `.d.mts` becomes `.d.ts`. */
const bundlePath = (distributionPath: string): string => distributionPath.replace(/\.d\.mts$/u, '.d.ts');

const declarationFiles = (distributionRoot: string): string[] =>
  readdirSync(distributionRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.d.mts'))
    .map((entry) => relative(distributionRoot, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();

/**
 * Each public subpath's declaration entry, relative to `dist/`, read from the installed exports map.
 *
 * @param manifest - The installed `package.json`.
 * @returns The `.d.ts` entry per public subpath, in exports-map order.
 */
const publicEntries = (manifest: InstalledManifest): Record<string, string> => {
  const entries: Record<string, string> = {};
  for (const [specifier, target] of Object.entries(manifest.exports)) {
    const types = typeof target === 'object' ? target.types : undefined;
    if (types === undefined) {
      continue;
    }
    if (!types.startsWith('./dist/') || !types.endsWith('.d.mts')) {
      throw new Error(`geospec export ${specifier} has types outside dist/: ${types}`);
    }
    entries[specifier] = `./${bundlePath(types.slice('./dist/'.length))}`;
  }
  return entries;
};

export function buildGeoSpecTypeBundle(): Record<string, GeneratedPackageTypes> {
  const root = packageRoot();
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as InstalledManifest;
  if (manifest.name !== 'geospec') {
    throw new Error(`node_modules/geospec is ${manifest.name}`);
  }
  const distributionRoot = join(root, 'dist');
  const files: Record<string, string> = {};
  for (const path of declarationFiles(distributionRoot)) {
    files[bundlePath(path)] = readFileSync(join(distributionRoot, path), 'utf8').replaceAll(
      relativeImportPattern,
      '$1.js$2',
    );
  }
  const entries = publicEntries(manifest);
  for (const [specifier, types] of Object.entries(entries)) {
    if (files[types.slice(2)] === undefined) {
      throw new Error(`geospec export ${specifier} names a missing declaration: ${types}`);
    }
  }
  const rootContent = files['index.d.ts'];
  if (!rootContent) {
    throw new Error('The installed geospec package has no dist/index.d.mts');
  }
  delete files['index.d.ts'];

  return {
    geospec: {
      content: rootContent,
      files,
      packageJson: {
        name: 'geospec',
        type: 'module',
        types: 'index.d.ts',
        exports: Object.fromEntries(Object.entries(entries).map(([specifier, types]) => [specifier, { types }])),
      },
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
