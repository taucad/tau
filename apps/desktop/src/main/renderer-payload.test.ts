import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPackage } from '@electron/asar';
// oxlint-disable-next-line no-restricted-imports -- the test directly owns this project-local operator script.
import { inspectDesktopPayload } from '../../scripts/check-renderer-payload.mjs';

const roots: string[] = [];
const require = createRequire(import.meta.url);
const clipperSource = require.resolve('clipper2-wasm/dist/es/clipper2z.wasm').replaceAll('\\', '/');
const asset = (fileName: string, bytes: Uint8Array<ArrayBuffer>) => ({
  fileName,
  sourcePath: clipperSource,
  sha256: createHash('sha256').update(bytes).digest('hex'),
});
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'tau-payload-test-'));
  roots.push(root);
  const renderer = join(root, 'renderer');
  const host = join(root, 'host');
  await Promise.all([mkdir(renderer), mkdir(host)]);
  await writeFile(join(renderer, 'renamed.js'), 'export {};');
  await writeFile(
    join(renderer, 'tau-module-graph-123.json'),
    JSON.stringify({ chunks: [{ fileName: 'renamed.js', moduleIds: ['apps/ui/app/root-layout.tsx'] }] }),
  );
  return { root, renderer, host };
};

describe('Desktop renderer ownership', () => {
  it('should retain editor WASM and not follow symlinks out of the renderer', async () => {
    const paths = await fixture();
    const wasm = Uint8Array.from(await readFile(clipperSource));
    await writeFile(join(paths.renderer, 'clipper2z-123.wasm'), wasm);
    await writeFile(
      join(paths.renderer, 'tau-module-graph-123.json'),
      JSON.stringify({
        chunks: [{ fileName: 'renamed.js', moduleIds: ['apps/ui/app/root-layout.tsx'] }],
        assets: [asset('clipper2z-123.wasm', wasm)],
      }),
    );
    await symlink(paths.root, join(paths.renderer, 'outside'));
    const report = await inspectDesktopPayload(paths);
    expect(report.violations).toEqual([]);
    expect(report.files.filter((file) => file.kind === 'wasm').map((file) => [file.path, file.bytes])).toEqual([
      ['clipper2z-123.wasm', wasm.byteLength],
    ]);
  });

  it('should accept identical shared-worker provenance but reject conflicting producers', async () => {
    const paths = await fixture();
    const wasm = Uint8Array.from(await readFile(clipperSource));
    const graph = {
      chunks: [{ fileName: 'renamed.js', moduleIds: ['apps/ui/app/root-layout.tsx'] }],
      assets: [asset('clipper2z.wasm', wasm)],
    };
    await writeFile(join(paths.renderer, 'clipper2z.wasm'), wasm);
    await writeFile(join(paths.renderer, 'tau-module-graph-123.json'), JSON.stringify(graph));
    await writeFile(join(paths.renderer, 'tau-module-graph-worker.json'), JSON.stringify(graph));
    const identical = await inspectDesktopPayload(paths);
    expect(identical.violations).toEqual([]);
    graph.assets[0]!.sourcePath = 'unknown/producer.wasm';
    await writeFile(join(paths.renderer, 'tau-module-graph-worker.json'), JSON.stringify(graph));
    const conflicting = await inspectDesktopPayload(paths);
    expect(conflicting.violations).toEqual([
      expect.stringContaining('Renderer WASM lacks allowed producer provenance'),
    ]);
  });

  it('should reject renamed execution modules and byte-identical host kernels', async () => {
    const paths = await fixture();
    const wasm = Uint8Array.from(await readFile(clipperSource));
    await writeFile(join(paths.renderer, 'innocent.dat'), wasm);
    await writeFile(join(paths.host, 'kernel.wasm'), wasm);
    await writeFile(
      join(paths.renderer, 'tau-module-graph-123.json'),
      JSON.stringify({
        chunks: [{ fileName: 'renamed.js', moduleIds: ['packages/plugins/openrscad/src/openrscad.kernel.ts'] }],
      }),
    );
    const report = await inspectDesktopPayload(paths);
    expect(report.violations).toEqual(
      expect.arrayContaining([
        'Renderer WASM is not editor/viewer-owned: innocent.dat',
        'Renderer execution module in renamed.js: packages/plugins/openrscad/src/openrscad.kernel.ts',
        expect.stringContaining('Renderer/host WASM overlap: innocent.dat'),
      ]),
    );
  });

  it('should recognize fingerprinted React Router JSON without exempting appended execution', async () => {
    const paths = await fixture();
    const data = { entry: { module: '/renamed.js' }, routes: {} };
    const version = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 8);
    const fileName = `assets/manifest-${version}.js`;
    const source = `window.__reactRouterManifest=${JSON.stringify({ ...data, url: `/${fileName}`, version })};`;
    await mkdir(join(paths.renderer, 'assets'));
    await writeFile(join(paths.renderer, fileName), source);
    const valid = await inspectDesktopPayload(paths);
    expect(valid.violations).toEqual([]);
    expect(valid.chunks).toContainEqual({
      fileName,
      moduleIds: ['@react-router/dev/vite:generated-manifest'],
      imports: [],
      forwardingOnly: false,
    });
    await writeFile(join(paths.renderer, fileName), `${source} globalThis.runHiddenKernel();`);
    const injected = await inspectDesktopPayload(paths);
    expect(injected.violations).toContain(`Renderer JavaScript is absent from module graph: ${fileName}`);
  });

  it('should detect embedded WASM and refuse an absent emitted graph', async () => {
    const paths = await fixture();
    await rm(join(paths.renderer, 'tau-module-graph-123.json'));
    await writeFile(join(paths.renderer, 'renamed.js'), 'const data = "AGFzbQEAAAA=";');
    const report = await inspectDesktopPayload(paths);
    expect(report.violations).toEqual(
      expect.arrayContaining([
        'Desktop emitted module graph is missing',
        'Desktop emitted module graph has no chunks',
        'Embedded WASM requires producer classification: renamed.js',
        'Renderer JavaScript is absent from module graph: renamed.js',
      ]),
    );
  });

  it('should reject unclassified binary data while allowing shipped images and fonts', async () => {
    const paths = await fixture();
    await Promise.all([
      writeFile(join(paths.renderer, 'hidden.png'), Buffer.from([0xff, 0, 0x85, 0x90])),
      writeFile(join(paths.renderer, 'known.png'), Buffer.from('89504e470d0a1a0a', 'hex')),
      writeFile(join(paths.renderer, 'font.woff2'), Buffer.from('774f46320000', 'hex')),
      writeFile(join(paths.renderer, 'style.css'), 'body { color: red; }'),
    ]);
    const report = await inspectDesktopPayload(paths);
    expect(report.violations).toEqual(['Unclassified binary in renderer: hidden.png']);
  });

  it('should reject empty, stale, duplicate, and incomplete graph coverage', async () => {
    const paths = await fixture();
    await writeFile(join(paths.renderer, 'worker.js'), 'export {};');
    await writeFile(
      join(paths.renderer, 'tau-module-graph-123.json'),
      JSON.stringify({
        chunks: [
          { fileName: 'missing.js', moduleIds: [] },
          { fileName: 'missing.js', moduleIds: ['apps/ui/app/root-layout.tsx'] },
        ],
      }),
    );
    const report = await inspectDesktopPayload(paths);
    expect(report.violations).toEqual(
      expect.arrayContaining([
        'Desktop emitted module graph has duplicate chunks',
        'Desktop emitted module graph chunk has no modules: missing.js',
        'Desktop emitted module graph references missing chunk: missing.js',
        'Renderer JavaScript is absent from module graph: renamed.js',
        'Renderer JavaScript is absent from module graph: worker.js',
      ]),
    );
  });

  it('should verify forwarding-only chunks against their parsed imports', async () => {
    const paths = await fixture();
    await Promise.all([
      writeFile(join(paths.renderer, 'forward.js'), 'import { value } from "./renamed.js"; export { value };'),
      writeFile(join(paths.renderer, 'empty-css.js'), '/* empty css */'),
      writeFile(
        join(paths.renderer, 'tau-module-graph-123.json'),
        JSON.stringify({
          chunks: [
            { fileName: 'renamed.js', moduleIds: ['apps/ui/app/root-layout.tsx'] },
            { fileName: 'forward.js', moduleIds: [], imports: ['renamed.js'], forwardingOnly: true },
            { fileName: 'empty-css.js', moduleIds: [], imports: [], forwardingOnly: true },
          ],
        }),
      ),
    ]);
    const valid = await inspectDesktopPayload(paths);
    expect(valid.violations).toEqual([]);

    await writeFile(join(paths.renderer, 'forward.js'), 'globalThis.runHiddenKernel();');
    const executable = await inspectDesktopPayload(paths);
    expect(executable.violations).toContain('Desktop emitted module graph chunk has no modules: forward.js');

    await writeFile(join(paths.renderer, 'forward.js'), 'export { value } from "./missing.js";');
    await writeFile(
      join(paths.renderer, 'tau-module-graph-123.json'),
      JSON.stringify({
        chunks: [
          { fileName: 'renamed.js', moduleIds: ['apps/ui/app/root-layout.tsx'] },
          { fileName: 'forward.js', moduleIds: [], imports: ['missing.js'], forwardingOnly: true },
          { fileName: 'empty-css.js', moduleIds: [], imports: [], forwardingOnly: true },
        ],
      }),
    );
    const uncovered = await inspectDesktopPayload(paths);
    expect(uncovered.violations).toContain(
      'Desktop forwarding chunk references uncovered import: forward.js -> missing.js',
    );
  });

  it('should reject runtime/plugin execution but allow pure contracts', async () => {
    const paths = await fixture();
    await writeFile(
      join(paths.renderer, 'tau-module-graph-123.json'),
      JSON.stringify({
        chunks: [
          {
            fileName: 'renamed.js',
            moduleIds: [
              'packages/runtime/src/framework/kernel-worker.ts',
              'packages/runtime/src/framework/runtime-framework.constants.ts',
              'packages/runtime/src/plugins/plugin-types.ts',
              'packages/plugins/future-kernel/src/index.ts',
              'libs/chat/src/schemas/rpc.schema.ts',
              'node_modules/nanoraster/dist/options.mjs',
              'node_modules/nanoraster/dist/render-error.mjs',
              'node_modules/nanoraster/dist/render.mjs',
            ],
          },
        ],
      }),
    );
    const report = await inspectDesktopPayload(paths);
    expect(report.violations.filter((violation) => violation.includes('Renderer execution module'))).toEqual(
      [
        'Renderer execution module in renamed.js: node_modules/nanoraster/dist/render.mjs',
        'Renderer execution module in renamed.js: packages/runtime/src/framework/kernel-worker.ts',
        'Renderer execution module in renamed.js: packages/plugins/future-kernel/src/index.ts',
      ].sort(),
    );
  });

  it('should reject web-only consent, marketing, legal, and analytics modules', async () => {
    const paths = await fixture();
    await writeFile(
      join(paths.renderer, 'tau-module-graph-123.json'),
      JSON.stringify({
        chunks: [
          {
            fileName: 'renamed.js',
            moduleIds: [
              'apps/ui/app/components/cookie-consent.tsx',
              'apps/ui/app/routes/_index/route.tsx',
              'apps/ui/app/routes/_index/marketing-landing.tsx',
              'apps/ui/app/routes/legal.cookies/route.tsx',
              'apps/ui/app/offline/offline-shell.tsx',
              'node_modules/posthog-js/dist/module.js',
            ],
          },
        ],
      }),
    );

    const report = await inspectDesktopPayload(paths);
    expect(report.violations.filter((violation) => violation.startsWith('Forbidden web surface'))).toHaveLength(6);
  });

  it('should reject web-only metadata from desktop HTML', async () => {
    const paths = await fixture();
    await writeFile(join(paths.renderer, 'index.html'), '<link rel="manifest" href="/manifest.webmanifest">');

    const report = await inspectDesktopPayload(paths);

    expect(report.violations).toContain('Web-only metadata in desktop HTML: manifest.webmanifest');
  });

  it('should detect disguised retained WASM and FAT64 binaries', async () => {
    const paths = await fixture();
    const wasm = Uint8Array.from(await readFile(clipperSource));
    await writeFile(join(paths.renderer, 'clipper2z-copy.wasm'), wasm);
    await writeFile(join(paths.host, 'engine.wasm'), wasm);
    await writeFile(join(paths.renderer, 'fat.bin'), Buffer.from([0xca, 0xfe, 0xba, 0xbf]));
    const report = await inspectDesktopPayload(paths);
    expect(report.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Renderer/host WASM overlap: clipper2z-copy.wasm'),
        expect.stringContaining('Renderer WASM lacks allowed producer provenance: clipper2z-copy.wasm'),
        'Native executable in renderer: fat.bin',
      ]),
    );
  });

  it('should inspect packaged ASAR renderer entries without double-counting physical totals', async () => {
    const paths = await fixture();
    const source = join(paths.root, 'asar-source');
    const app = join(paths.root, 'Tau.app');
    await mkdir(join(source, 'lib'), { recursive: true });
    await mkdir(join(app, 'Contents/Resources'), { recursive: true });
    await writeFile(join(source, 'lib/index.js'), 'export {};');
    await createPackage(source, join(app, 'Contents/Resources/app.asar'));
    const report = await inspectDesktopPayload({ ...paths, app });
    expect(report.files).toEqual(
      expect.arrayContaining([expect.objectContaining({ scope: 'asar', path: 'lib/index.js', kind: 'javascript' })]),
    );
    expect(Object.keys(report.totals).some((key) => key.startsWith('asar/'))).toBe(false);
  });

  it('should correlate the real packaged UI layout with the loose renderer', async () => {
    const paths = await fixture();
    const app = join(paths.root, 'Tau.app');
    const packaged = join(app, 'Contents/Resources/ui/client');
    const preview = join(app, 'Contents/PlugIns/TauQuickLookPreview.appex/Contents/Resources');
    const thumbnail = join(app, 'Contents/PlugIns/TauQuickLookThumbnail.appex/Contents/Resources');
    const asarSource = join(paths.root, 'empty-asar');
    const wasm = Uint8Array.from(await readFile(clipperSource));
    const graph = JSON.stringify({
      chunks: [{ fileName: 'renamed.js', moduleIds: ['apps/ui/app/root-layout.tsx'] }],
      assets: [asset('clipper2z.wasm', wasm)],
    });
    await Promise.all([
      mkdir(packaged, { recursive: true }),
      mkdir(preview, { recursive: true }),
      mkdir(thumbnail, { recursive: true }),
      mkdir(asarSource),
    ]);
    await writeFile(join(asarSource, 'package.json'), '{}');
    await createPackage(asarSource, join(app, 'Contents/Resources/app.asar'));
    await Promise.all([
      writeFile(join(paths.renderer, 'clipper2z.wasm'), wasm),
      writeFile(join(paths.renderer, 'tau-module-graph-123.json'), graph),
      writeFile(join(packaged, 'renamed.js'), 'export {};'),
      writeFile(join(packaged, 'clipper2z.wasm'), wasm),
      writeFile(join(paths.renderer, 'renamed.js.map'), '{}'),
      writeFile(join(preview, 'converter.wasm'), wasm),
      writeFile(join(thumbnail, 'converter.wasm'), wasm),
    ]);
    const matching = await inspectDesktopPayload({ ...paths, app });
    expect(matching.violations).toEqual([]);
    await writeFile(join(packaged, 'injected.js'), 'export {};');
    const injected = await inspectDesktopPayload({ ...paths, app });
    expect(injected.violations).toContain('Packaged renderer has no matching loose build file: injected.js');
    await rm(join(packaged, 'injected.js'));
    await writeFile(join(packaged, 'clipper2z.wasm'), Buffer.from([0, 97, 115, 109, 2, 0, 0, 0]));
    const changed = await inspectDesktopPayload({ ...paths, app });
    expect(changed.violations).toContain('Packaged renderer differs from loose build: clipper2z.wasm');
  });
});
