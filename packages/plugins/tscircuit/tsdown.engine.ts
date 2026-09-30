import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'tsdown';
import type { Plugin } from 'rolldown';

const require = createRequire(import.meta.url);
// These chunk names belong to pinned circuit-json-to-gltf 0.0.123; refresh both on a catalog bump.
const converterRoot = require.resolve('circuit-json-to-gltf');
const browserTexture = require.resolve('circuit-json-to-gltf/dist/svg-to-png-browser-MXUWCXAZ.js');
const wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
const wasmBase64 = readFileSync(wasmPath).toString('base64');
const nativeStub = new URL('src/engine/native-stub.ts', import.meta.url).pathname;
// Reviewed source packages with absent licence text in the pinned graph (L4/F12).
const heldOverrides = new Map([
  ['@tscircuit/checks', 'upstream package ships no LICENSE text'],
  ['@tscircuit/copper-pour-solver', 'upstream package ships no LICENSE text'],
  ['@tscircuit/infgrid-ijump-astar', 'upstream package ships no LICENSE text'],
  ['graphics-debug', 'upstream package ships no LICENSE text'],
  ['circuit-json', 'ISC field without LICENSE text'],
  ['circuit-to-svg', 'ISC field without LICENSE text'],
  ['@tscircuit/soup-util', 'ISC field without LICENSE text'],
]);

const packageRoot = (id: string): string | undefined => {
  const index = id.lastIndexOf('/node_modules/');
  if (index === -1) {
    return undefined;
  }
  const base = id.slice(0, index + '/node_modules/'.length);
  const parts = id.slice(base.length).split('/');
  return join(base, ...parts.slice(0, parts[0]?.startsWith('@') ? 2 : 1));
};

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
    const licensePath = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md']
      .map((name) => join(root, name))
      .find((path) => existsSync(path));
    const text =
      licensePath === undefined ? undefined : readFileSync(licensePath, 'utf8').replace(/\r\n?/gu, '\n').trim();
    return [
      {
        name: manifest.name,
        version: manifest.version,
        license: manifest.license,
        text,
        hold: heldOverrides.get(manifest.name),
      },
    ];
  });
  const unique = [...new Map(entries.map((entry) => [`${entry.name}@${entry.version}`, entry])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const lines = [
    '# Vendored tscircuit engine licences',
    '',
    'Generated from the LICENSE text shipped with each package included in the engine. HELD and REVIEW PENDING entries block publication. A package.json licence field alone does not clear review.',
    '',
    ...unique.flatMap(({ name, version, license, text, hold }) => [
      `## ${name}@${version} — ${hold === undefined && text !== undefined ? 'REVIEW PENDING' : 'HELD'} (${license ?? 'no SPDX field'})`,
      '',
      hold === undefined
        ? (text ?? 'HELD: package did not ship a LICENSE text.')
        : `Hold reason: ${hold}.\n\n${text ?? 'Package did not ship a LICENSE text.'}`,
      '',
    ]),
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
    return `import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { tscircuit_font_default as font } from './chunk-W5ZY3YD5.js';
let ready;
export async function svgToPngDataUrl(svg, options = {}) {
  ready ??= initWasm(Uint8Array.fromBase64('${wasmBase64}')).catch((error) => {
    if (!String(error).includes('Already initialized')) throw error;
  });
  await ready;
  const resvg = new Resvg(svg, {
    background: options.background,
    font: { loadSystemFonts: false, fontBuffers: [Uint8Array.fromBase64(font)], defaultFontFamily: 'TscircuitAlphabet' },
    fitTo: options.width ? { mode: 'width', value: options.width } : options.height ? { mode: 'height', value: options.height } : undefined,
  });
  try {
    const rendered = resvg.render();
    try {
      const image = rendered.asPng();
      let binary = '';
      for (const byte of image) binary += String.fromCharCode(byte);
      return 'data:image/png;base64,' + btoa(binary);
    } finally {
      rendered.free();
    }
  } finally {
    resvg.free();
  }
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
    // The WASM bytes are embedded in the lazy texture chunk, while its JS wrapper stays external.
    roots.add(dirname(wasmPath));
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
    alwaysBundle: (id) =>
      !/^(?:@taucad\/|@tscircuit\/manifold-2d(?:\/|$)|@resvg\/resvg-wasm(?:\/|$)|zod(?:\/|$))/u.test(id),
    neverBundle: [/^@tscircuit\/manifold-2d(?:\/|$)/u, /^@resvg\/resvg-wasm(?:\/|$)/u],
    onlyImport: [/^@tscircuit\/manifold-2d(?:\/|$)/u, /^@resvg\/resvg-wasm(?:\/|$)/u, /^zod(?:\/|$)/u],
    onlyBundle: false,
  },
});
