import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { defineConfig } from 'tsdown';
import type { Plugin } from 'rolldown';

const require = createRequire(import.meta.url);
// These chunk names belong to pinned circuit-json-to-gltf 0.0.123; refresh both on a catalog bump.
const converterRoot = require.resolve('circuit-json-to-gltf');
const browserTexture = require.resolve('circuit-json-to-gltf/dist/svg-to-png-browser-MXUWCXAZ.js');
const nativeStub = new URL('src/engine/native-stub.ts', import.meta.url).pathname;
// Licence texts the published packages omit, copied from each upstream repository's default branch
// on 2026-10-02 into `licenses/`. Packages still missing text are DEFERRED, not blocking: every one
// declares or is known to carry an OSS licence, and the text is tracked as follow-up work.
const upstreamLicenses = new Map([
  ['@tscircuit/mm', 'https://github.com/tscircuit/mm/blob/main/LICENSE'],
  ['@tscircuit/soup-util', 'https://github.com/tscircuit/soup-util/blob/main/LICENSE'],
  ['boolbase', 'https://github.com/fb55/boolbase/blob/master/LICENSE'],
  ['color-diff', 'https://github.com/markusn/color-diff/blob/master/COPYING'],
  ['connectivity-map', 'https://github.com/tscircuit/connectivity-map/blob/main/LICENSE'],
]);

/**
 * Identifies a licence text by the grant clauses that distinguish each OSS licence.
 *
 * @param text - Licence text with normalised line endings.
 * @returns The SPDX identifier, or `undefined` when no known grant matches.
 */
const identifyLicense = (text: string): string | undefined => {
  const flat = text.replaceAll(/\s+/gu, ' ');
  if (flat.includes('Mozilla Public License Version 2.0')) {
    return 'MPL-2.0';
  }
  if (/Apache License,? Version 2\.0/u.test(flat)) {
    return 'Apache-2.0';
  }
  if (
    flat.includes('Permission is hereby granted, free of charge') &&
    flat.includes('shall be included in all copies')
  ) {
    return 'MIT';
  }
  if (
    /Permission to use, copy, modify, (?:and\/or |and )?distribute this software for any purpose with or without fee is hereby granted/u.test(
      flat,
    )
  ) {
    return flat.includes('above copyright notice') ? 'ISC' : '0BSD';
  }
  if (flat.includes('Redistribution and use in source and binary forms')) {
    return /Neither the name|names of (?:its|the) contributors/u.test(flat) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  }
  if (flat.includes('This is free and unencumbered software released into the public domain')) {
    return 'Unlicense';
  }
  return undefined;
};

const packageRoot = (id: string): string | undefined => {
  const index = id.lastIndexOf('/node_modules/');
  if (index === -1) {
    return undefined;
  }
  const base = id.slice(0, index + '/node_modules/'.length);
  const parts = id.slice(base.length).split('/');
  return join(base, ...parts.slice(0, parts[0]?.startsWith('@') ? 2 : 1));
};

const readText = (path: string): string => readFileSync(path, 'utf8').replaceAll(/\r\n?/gu, '\n').trim();

const writeLicenses = (roots: ReadonlySet<string>): void => {
  const entries = [...roots].flatMap((root) => {
    const manifestPath = join(root, 'package.json');
    if (!existsSync(manifestPath)) {
      return [];
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name: string;
      version: string;
      license?: string;
    };
    const licenseName = readdirSync(root)
      .sort()
      .find((name) => /^(?:licen[cs]e|copying)(?:[-.](?:md|txt|mit))?$/iu.test(name));
    const licensePath = licenseName === undefined ? undefined : join(root, licenseName);
    const upstream = upstreamLicenses.get(manifest.name);
    const upstreamPath = new URL(`licenses/${manifest.name.replace('@', '').replace('/', '__')}.txt`, import.meta.url);
    const fallback = upstream === undefined ? undefined : readText(upstreamPath.pathname);
    const text = licensePath === undefined ? fallback : readText(licensePath);
    return [{ name: manifest.name, version: manifest.version, license: manifest.license, text, upstream }];
  });
  const unique = [...new Map(entries.map((entry) => [`${entry.name}@${entry.version}`, entry])).values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }),
  );
  const lines = [
    '# Vendored tscircuit engine licences',
    '',
    'Generated from the LICENSE text shipped with each package included in the engine, or, where a package ships none, the text in its upstream repository. CLEARED entries carry text identified as an OSS licence. DEFERRED entries have no text yet; they do not block publication and are tracked as follow-up work. HELD and REVIEW PENDING entries block publication.',
    '',
    ...unique.flatMap(({ name, version, license, text, upstream }) => {
      const identified = text === undefined ? undefined : identifyLicense(text);
      const declared = license ?? 'no SPDX field';
      if (text === undefined) {
        return [
          `## ${name}@${version} — DEFERRED (${declared})`,
          '',
          'Deferred: no licence text in the package or its upstream repository.',
          '',
        ];
      }
      if (identified === undefined) {
        return [
          `## ${name}@${version} — DEFERRED (${declared})`,
          '',
          'Deferred: the licence text is not a recognised OSS licence and needs a manual read.',
          '',
          text,
          '',
        ];
      }
      const notes = [
        upstream === undefined ? undefined : `Text from ${upstream}; the published package ships none.`,
        license === undefined || license === identified
          ? undefined
          : `package.json declares ${license}; the text is ${identified}.`,
      ].filter((note) => note !== undefined);
      return [
        `## ${name}@${version} — CLEARED (${identified})`,
        '',
        ...(notes.length > 0 ? [notes.join(' '), ''] : []),
        text,
        '',
      ];
    }),
  ];
  writeFileSync(new URL('THIRD_PARTY_LICENSES.md', import.meta.url), lines.join('\n'));
};

const engineRules: Plugin = {
  name: 'tscircuit-engine',
  resolveId: {
    order: 'pre',
    async handler(id, importer) {
      if (/^(?:@resvg\/resvg-js|occt-import-js)(?:\/|$)/u.test(id)) {
        return nativeStub;
      }
      if (/^\.\/svg-to-png-[\w]+\.js$/u.test(id) && importer === converterRoot) {
        return browserTexture;
      }
      if (id === 'zod' && importer?.includes('/node_modules/')) {
        return this.resolve('zod/v3', import.meta.filename, { skipSelf: true });
      }
      return undefined;
    },
  },
  load(id) {
    if (id !== browserTexture) {
      return undefined;
    }
    // The kernel always passes `boardTextureResolution: 0`, so the converter never rasterizes a
    // board texture; this stub keeps resvg (native and WASM) out of the engine.
    return `export async function svgToPngDataUrl() {
  throw new Error('Tau renders tscircuit boards without raster textures.');
}`;
  },
  generateBundle() {
    const roots = new Set<string>();
    for (const id of this.getModuleIds()) {
      const root = packageRoot(id);
      if (root !== undefined) {
        roots.add(root);
      }
    }
    writeLicenses(roots);
  },
};

export default defineConfig({
  entry: {
    core: 'src/engine/core.ts',
    gltf: 'src/engine/gltf.ts',
    svg: 'src/engine/svg.ts',
    bom: 'src/engine/bom.ts',
    netlist: 'src/engine/netlist.ts',
    react: 'src/engine/react.ts',
    'jsx-runtime': 'src/engine/jsx-runtime.ts',
    alphabet: 'src/engine/alphabet.ts',
    'kicad-catalog': 'src/engine/kicad-catalog.ts',
  },
  outDir: 'dist/engine',
  format: 'esm',
  platform: 'browser',
  fixedExtension: true,
  target: 'es2022',
  tsconfig: 'tsconfig.build.json',
  clean: true,
  dts: false,
  minify: true,
  unbundle: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [engineRules],
  deps: {
    alwaysBundle: (id) => !/^(?:@taucad\/|@tscircuit\/manifold-2d(?:\/|$)|zod(?:\/|$))/u.test(id),
    neverBundle: [/^@tscircuit\/manifold-2d(?:\/|$)/u],
    onlyImport: [/^@tscircuit\/manifold-2d(?:\/|$)/u, /^zod(?:\/|$)/u],
    onlyBundle: false,
  },
});
