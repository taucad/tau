import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { plugin, tscircuit, tscircuitKernel } from '#index.js';

describe('@taucad/tscircuit', () => {
  it('binds the mechanical plugin alias to the package-named factory', () => {
    expect(tscircuit).toBe(plugin);
  });

  it('exports the named plugin', async () => {
    const { plugin: importedPlugin } = await import('#index.js');
    expect(importedPlugin).toBe(plugin);
    const { capabilities } = plugin();
    expect(capabilities.kernels.map(({ id }) => id)).toEqual(['tscircuit']);
    expect(capabilities.middleware.map(({ id }) => id)).toEqual([]);
    expect(capabilities.bundlers.map(({ id }) => id)).toEqual([]);
    expect(capabilities.transcoders.map(({ id }) => id)).toEqual([]);
  });

  it('keeps the public root and documented view/export IDs in sync', async () => {
    expect(Object.keys(await import('#index.js')).sort()).toEqual(['plugin', 'tscircuit', 'tscircuitKernel']);
    const definition = tscircuitKernel();
    expect(Object.keys(definition.views)).toEqual(['board', 'schematic', 'pcb']);
    expect(Object.keys(definition.exports)).toEqual(['board', 'bom', 'netlist', 'circuit']);
    expect(
      Object.fromEntries(Object.entries(definition.exports).map(([id, declaration]) => [id, declaration.extension])),
    ).toEqual({
      board: 'glb',
      bom: 'csv',
      netlist: 'txt',
      circuit: 'json',
    });
    expect(definition.views.pcb.optionsSchema).toMatchObject({
      properties: { pinNumbers: { title: 'Pin numbers', type: 'boolean' } },
    });
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    for (const id of ['board', 'schematic', 'pcb', 'bom', 'netlist', 'circuit']) {
      expect(readme).toContain(`\`${id}\``);
    }
  });

  it('keeps the board skill and shipped resources aligned with the kernel declarations', async () => {
    const definition = tscircuitKernel();
    const doctrine = readFileSync(new URL('../agent/doctrine.md', import.meta.url), 'utf8');
    const skill = readFileSync(new URL('../agent/cad-tscircuit/SKILL.md', import.meta.url), 'utf8');
    const manifest: unknown = JSON.parse(readFileSync(new URL('../agent/skills.json', import.meta.url), 'utf8'));
    const resourcesModule = await import('../agent/resources.js');
    const resources = resourcesModule.default;

    for (const id of Object.keys(definition.views)) {
      expect(doctrine).toContain(`\`${id}\``);
    }
    for (const [id, declaration] of Object.entries(definition.exports)) {
      expect(doctrine).toContain(`\`${id}\` (\`${declaration.extension}\`)`);
    }
    expect(doctrine).toContain('## Check a board');
    expect(doctrine).toContain('`evaluate_model`');
    expect(doctrine).toContain('`export_model`');
    expect(doctrine).not.toMatch(/`output` render option selects/u);
    expect(skill).toContain(doctrine.trim());
    expect(manifest).toMatchObject({ bundles: [{ body: skill }] });
    expect(resources[0]?.body).toBe(skill);
  });

  it('keeps native, Python, and Node-only payloads out of browser source', () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
    // Mirrors `nodeOnlyDependencies` in tools/pkgcheck-metadata.ts, the single source; a
    // published package must not import from `tools/`, so the list is copied, not shared.
    const nodeOnlyPackages = new Set([
      'better-sqlite3',
      'bufferutil',
      'canvas',
      'fs-extra',
      'node-fetch',
      'node-gyp-build',
      'sharp',
      'utf-8-validate',
      'ws',
    ]);
    const offenders = readdirSync(sourceDirectory, { encoding: 'utf8', recursive: true })
      .filter((name) => name.endsWith('.ts') && !name.includes('.test'))
      .flatMap((name) => {
        // Comments are prose, not payload: a doc comment naming `import('ws')` is not an import.
        // `import type` is erased before the bundle exists, so it is not payload either.
        const source = readFileSync(join(sourceDirectory, name), 'utf8')
          .replaceAll(/\/\*[\S\s]*?\*\//g, '')
          .replaceAll(/^\s*\/\/.*$/gm, '')
          .replaceAll(/^\s*(?:import|export)\s+type\s[^;]*;/gm, '');

        return [...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)]
          .map((match) => match[1]!)
          .filter(
            (specifier) =>
              nodeBuiltins.has(specifier) ||
              nodeOnlyPackages.has(specifier) ||
              specifier.includes('-native') ||
              specifier.includes('-python'),
          )
          .map((specifier) => `${name}: ${specifier}`);
      });

    expect(offenders).toEqual([]);
  });
});
