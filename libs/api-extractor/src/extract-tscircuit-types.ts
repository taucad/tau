#!/usr/bin/env node

/**
 * Regenerate `generated/tscircuit/tscircuit.corpus.json` (the skill reference)
 * and `generated/tscircuit/tscircuit.bundled.json` (the editor declarations)
 * from the tscircuit packages the `@taucad/tscircuit` plugin resolves.
 *
 * pnpm links `@tscircuit/*` into the plugin's own `node_modules`, not the
 * workspace root, so resolution starts there and follows the store symlink;
 * the core's own dependencies then resolve beside it in the store.
 *
 * @module
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import { extractTscircuitApi, tscircuitCorpusFile } from '#languages/typescript/tscircuit.js';
import { buildTscircuitTypes } from '#languages/typescript/tscircuit-declarations.js';

const pluginModules = join(import.meta.dirname, '../../../packages/plugins/tscircuit/node_modules');
const workspaceModules = join(import.meta.dirname, '../../../node_modules');
const bundledTypesFile = join(import.meta.dirname, 'generated/tscircuit/tscircuit.bundled.json');

const packageDirectory = (name: string): string => realpathSync(join(pluginModules, name));

const versionOf = (directory: string): string =>
  (JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { readonly version: string }).version;

const main = (): void => {
  const core = packageDirectory('@tscircuit/core');
  const props = packageDirectory('@tscircuit/props');
  const footprinter = packageDirectory('@tscircuit/footprinter');
  const corpus = extractTscircuitApi({
    coreDeclarations: join(core, 'dist/index.d.ts'),
    footprinterDeclarations: join(footprinter, 'dist/index.d.ts'),
    packageVersion: versionOf(core),
    extractor: `TypeScript ${ts.version} over @tscircuit/props ${versionOf(props)} and @tscircuit/footprinter ${versionOf(footprinter)}`,
  });
  // Keep the committed timestamp when nothing else changed, so regeneration is not a timestamp-only diff.
  const undated = (text: string): string => text.replace(/"extractionDate": "[^"]*"/u, '"extractionDate": ""');
  const text = `${JSON.stringify(corpus, undefined, 2)}\n`;
  const previous = existsSync(tscircuitCorpusFile) ? readFileSync(tscircuitCorpusFile, 'utf8') : undefined;
  if (previous !== undefined && undated(previous) === undated(text)) {
    console.log(`${String(corpus.metadata.totalEntries)} symbols, unchanged -> ${tscircuitCorpusFile}`);
    return;
  }
  mkdirSync(dirname(tscircuitCorpusFile), { recursive: true });
  writeFileSync(tscircuitCorpusFile, text);
  console.log(`${String(corpus.metadata.totalEntries)} symbols -> ${tscircuitCorpusFile}`);
};

const writeBundledTypes = (): void => {
  const core = packageDirectory('@tscircuit/core');
  const bundle = buildTscircuitTypes({
    coreDeclarations: join(core, 'dist/index.d.ts'),
    reactTypesDirectory: realpathSync(join(workspaceModules, '@types/react')),
    coreVersion: versionOf(core),
    propsVersion: versionOf(packageDirectory('@tscircuit/props')),
  });
  writeFileSync(bundledTypesFile, JSON.stringify(bundle));
  console.log(`${String(Object.keys(bundle).length)} editor packages -> ${bundledTypesFile}`);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
  writeBundledTypes();
}
