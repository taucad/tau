// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { inspectDesktopPayload } from '#scripts/check-desktop-payload.mjs';
// oxlint-disable-next-line no-restricted-imports -- this test exercises the application-owned graph producer against the desktop payload check.
import { createUiSourceAliasPlugin } from './vite.config.js';
// oxlint-disable-next-line no-restricted-imports -- the fixture emits through the UI's own language server asset plugins.
import { createCsharpLanguageAssets } from './csharp-language-assets.vite-plugin.js';
// oxlint-disable-next-line no-restricted-imports -- the fixture emits through the UI's own language server asset plugins.
import { createOpenscadLanguageAssets } from './openscad-language-assets.vite-plugin.js';

/*
 * The UI's own Vite plugins against the desktop payload check (`ui:check-desktop-payload`): the module graph the
 * source alias plugin emits for the desktop target, and the bytes the editor language server asset plugins emit, are
 * what the check reads. The check's own rules are covered by `scripts/check-desktop-payload.test.ts`.
 */

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

const violationsOf = async (paths: { renderer: string; host: string }) => {
  const report = await inspectDesktopPayload(paths);
  return report.violations;
};

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
  // No language server stages unless a test stages one, whatever this checkout has prepared.
  return { root, renderer, host, stagedLanguageServers: {} };
};

const sha256Of = (bytes: Uint8Array<ArrayBuffer> | string): string => createHash('sha256').update(bytes).digest('hex');
const wasmModule = (body: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, ...new TextEncoder().encode(body)]);

/** Stage both editor language servers and emit them into the renderer through the UI's own asset plugins. */
const stageLanguageServers = async (root: string, renderer: string) => {
  const csharp = join(root, 'csharp-stage');
  const openscad = join(root, 'openscad-stage');
  await Promise.all([mkdir(join(csharp, '_framework'), { recursive: true }), mkdir(openscad)]);
  // The .NET loader carries WASM header bytes, as the real dotnet.js does.
  const csharpFiles: Record<string, Uint8Array<ArrayBuffer>> = {
    '_framework/dotnet.js': Uint8Array.from(Buffer.from(String.raw`export const header = "\x00asm";`)),
    '_framework/dotnet.native.wasm': wasmModule('dotnet runtime'),
    '_framework/Tau.CSharp.LanguageService.wasm': wasmModule('language service'),
    'references.bin': Uint8Array.from(gzipSync('reference bundle')),
  };
  await Promise.all(Object.entries(csharpFiles).map(async ([path, bytes]) => writeFile(join(csharp, path), bytes)));
  await writeFile(
    join(csharp, 'assets-manifest.json'),
    JSON.stringify({
      format: 'tau-csharp-language-v1',
      bootstrap: '_framework/dotnet.js',
      references: 'references.bin',
      files: Object.entries(csharpFiles).map(([path, bytes]) => ({
        path,
        sha256: sha256Of(bytes),
        byteLength: bytes.byteLength,
      })),
    }),
  );
  const module = wasmModule('openscad language server');
  await writeFile(join(openscad, 'tau_openscad_language.wasm'), module);
  await writeFile(
    join(openscad, 'assets-manifest.json'),
    JSON.stringify({
      format: 'tau-openscad-language-v1',
      module: { path: 'tau_openscad_language.wasm', sha256: sha256Of(module), byteLength: module.byteLength },
    }),
  );
  const emitted: string[] = [];
  for (const { plugin } of [createCsharpLanguageAssets(csharp), createOpenscadLanguageAssets(openscad)]) {
    const files: Array<{ fileName: string; source: Uint8Array<ArrayBuffer> }> = [];
    const context = {
      environment: { config: { consumer: 'client' } },
      emitFile: (file: { fileName: string; source: Uint8Array<ArrayBuffer> }): string => {
        files.push(file);
        return file.fileName;
      },
    };
    const { generateBundle } = plugin;
    if (typeof generateBundle !== 'function') {
      throw new TypeError('Language asset plugin has no generateBundle hook.');
    }
    Reflect.apply(generateBundle, context, []);
    for (const { fileName, source } of files) {
      emitted.push(fileName);
      // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files.
      await mkdir(dirname(join(renderer, fileName)), { recursive: true });
      // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files.
      await writeFile(join(renderer, fileName), source);
    }
  }
  return { stages: { csharp, openscad }, emitted };
};

describe('Desktop renderer ownership of the UI plugins', () => {
  it.each([
    ['static import', "import { value } from 'virtual:web'; document.body.dataset.value = value;"],
    ['dynamic import', "void import('virtual:web').then(({ value }) => { document.body.dataset.value = value; });"],
    ['re-export', "import { value } from './bridge.js'; document.body.dataset.value = value;"],
  ])('should reject a web consent module reached through %s in a real Vite graph', async (_kind, entry) => {
    const paths = await fixture();
    const source = join(paths.root, 'source');
    await mkdir(source);
    await writeFile(join(source, 'entry.js'), entry);
    await writeFile(join(source, 'bridge.js'), "export { value } from 'virtual:web';");
    await build({
      configFile: false,
      root: source,
      logLevel: 'silent',
      plugins: [
        {
          name: 'web-module-fixture',
          resolveId(id) {
            return id === 'virtual:web' ? '\0apps/ui/app/lib/web-posthog.lib.ts' : null;
          },
          load(id) {
            return id === '\0apps/ui/app/lib/web-posthog.lib.ts'
              ? "document.body.dataset.webLoaded = 'true'; export const value = 'web';"
              : null;
          },
        },
        createUiSourceAliasPlugin({ emitModuleGraph: true, target: 'desktop' }),
      ],
      build: { outDir: paths.renderer, emptyOutDir: true, rollupOptions: { input: join(source, 'entry.js') } },
    });
    const report = await inspectDesktopPayload(paths);
    expect(report.violations).toContainEqual(expect.stringContaining('Forbidden web surface'));
    expect(report.violations.join('\n')).toContain('apps/ui/app/lib/web-posthog.lib.ts');
  });

  it('should admit the editor language servers only byte-for-byte from their prepared stages', async () => {
    const paths = await fixture();
    const { stages, emitted } = await stageLanguageServers(paths.root, paths.renderer);
    const runtime = emitted.find((path) => path.endsWith('/_framework/dotnet.native.wasm'))!;
    const openscadModule = emitted.find((path) => /^assets\/tau_openscad_language-[a-f0-9]{16}\.wasm$/u.test(path))!;
    expect(runtime).toMatch(/^csharp-language\/[a-f0-9]{64}\/_framework\/dotnet\.native\.wasm$/u);
    expect(openscadModule).toBeDefined();

    const admitted = await inspectDesktopPayload({ ...paths, stagedLanguageServers: stages });
    expect(admitted.violations).toEqual([]);

    // Without the stages the same files are unowned WASM and ungraphed JavaScript carrying WASM bytes.
    const unstaged = await violationsOf(paths);
    expect(unstaged).toEqual(
      expect.arrayContaining([
        `Renderer WASM is not editor/viewer-owned: ${runtime}`,
        `Renderer WASM lacks allowed producer provenance: ${openscadModule} (missing)`,
        expect.stringMatching(/^Embedded WASM requires producer classification: csharp-language\/.+\/dotnet\.js$/u),
        expect.stringMatching(/^Renderer JavaScript is absent from module graph: csharp-language\/.+\/dotnet\.js$/u),
      ]),
    );

    // A second copy at an unstaged path is not covered by the stage.
    const copy = await readFile(join(paths.renderer, runtime));
    await writeFile(join(paths.renderer, 'dotnet.native-copy.wasm'), copy);
    const duplicated = await inspectDesktopPayload({ ...paths, stagedLanguageServers: stages });
    expect(duplicated.violations).toEqual(
      expect.arrayContaining([
        'Renderer WASM is not editor/viewer-owned: dotnet.native-copy.wasm',
        'Renderer WASM lacks allowed producer provenance: dotnet.native-copy.wasm (missing)',
      ]),
    );
    await rm(join(paths.renderer, 'dotnet.native-copy.wasm'));

    // Changed renderer bytes at a staged path, including either emitted manifest, and a stage that no longer matches
    // its manifest all fail.
    const csharpManifest = emitted.find((path) => path.endsWith('/assets-manifest.json'))!;
    const openscadManifest = emitted.find((path) => /^assets\/openscad-language-[a-f0-9]{16}\.json$/u.test(path))!;
    await writeFile(join(paths.renderer, csharpManifest), '{}');
    await writeFile(join(paths.renderer, openscadManifest), '{}');
    await writeFile(join(paths.renderer, openscadModule), wasmModule('swapped module'));
    await writeFile(join(stages.csharp, '_framework/dotnet.native.wasm'), wasmModule('rebuilt runtime'));
    const tampered = await inspectDesktopPayload({ ...paths, stagedLanguageServers: stages });
    expect(tampered.violations).toEqual(
      expect.arrayContaining([
        `Renderer file differs from its language server stage: ${openscadModule}`,
        `Renderer file differs from its language server stage: ${csharpManifest}`,
        `Renderer file differs from its language server stage: ${openscadManifest}`,
        `Staged language server file does not match its manifest: ${stages.csharp}/_framework/dotnet.native.wasm`,
        `Renderer WASM is not editor/viewer-owned: ${runtime}`,
      ]),
    );
  });

  it('should refuse a C# stage whose manifest does not list its bootstrap', async () => {
    const paths = await fixture();
    const { stages } = await stageLanguageServers(paths.root, paths.renderer);
    const manifestPath = join(stages.csharp, 'assets-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { bootstrap: string };
    await writeFile(manifestPath, JSON.stringify({ ...manifest, bootstrap: '_framework/missing.js' }));
    const report = await inspectDesktopPayload({ ...paths, stagedLanguageServers: stages });
    expect(report.violations).toContain(`Staged C# language server manifest is invalid: ${stages.csharp}`);
  });
});
