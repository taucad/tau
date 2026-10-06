// @vitest-environment node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { InlineConfig } from 'vite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite plugin test lives outside app aliases.
import { createGeoSpecMtAssets } from './geospec-mt-assets.vite-plugin.js';

const hash = (bytes: string): string => createHash('sha256').update(bytes).digest('hex');

describe('GeoSpec qualified MT client assets', () => {
  it('exposes no MT receipt without a staged package', () => {
    expect(createGeoSpecMtAssets(undefined).receipts).toEqual({});
  });

  it('admits the qualified five-file closure and refuses changed qualification or bytes', () => {
    const stage = mkdtempSync(path.join(tmpdir(), 'geospec-mt-ui-'));
    const directory = path.join(stage, 'dist/bindings/mt-wasm/permits-4');
    mkdirSync(directory, { recursive: true });
    const write = (name: string, value: string): void => {
      writeFileSync(path.join(directory, name), value);
    };
    try {
      writeFileSync(
        path.join(stage, 'package.json'),
        JSON.stringify({
          name: '@taucad/geospec-engine-native',
          exports: {
            './mt-assets/permits-4/*': './dist/bindings/mt-wasm/permits-4/*',
          },
        }),
      );
      const glue = 'export default async () => ({})';
      const wasm = 'synthetic wasm bytes';
      write('geospec_engine_native.mjs', glue);
      write('geospec_engine_native.wasm', wasm);
      const output = path.join(stage, 'original-product');
      const build = JSON.stringify({
        schema: 'geospec-mixed-build-receipt-mt-v1',
        variant: 'mt',
        sourceRevision: 'a'.repeat(40),
        output,
        mtSettings: { executionPermits: 4 },
        artifacts: [
          {
            path: path.join(output, 'geospec_engine_native.mjs'),
            bytes: glue.length,
            sha256: hash(glue),
          },
          {
            path: path.join(output, 'geospec_engine_native.wasm'),
            bytes: wasm.length,
            sha256: hash(wasm),
          },
        ],
      });
      write('build-receipt.json', build);
      const asset = (file: string, value: string) => ({
        file,
        bytes: value.length,
        sha256: hash(value),
      });
      const receipt = JSON.stringify({
        schema: 'geospec-mixed-mt-assets-v1',
        permits: 4,
        buildReceipt: asset('build-receipt.json', build),
        glue: asset('geospec_engine_native.mjs', glue),
        wasm: asset('geospec_engine_native.wasm', wasm),
        worker: asset('geospec_engine_native.mjs', glue),
      });
      write('geospec_engine_native.mt.json', receipt);
      const qualification = {
        schema: 'geospec-mt-qualification-v1',
        verdict: 'passed',
        permits: 4,
        assetReceiptSha256: hash(receipt),
        buildReceiptSha256: hash(build),
        sourceRevision: 'a'.repeat(40),
        checks: { nodePthreads: true, browserPthreads: true, stParity: true },
      };
      write('qualification.json', JSON.stringify(qualification));
      const { receipts, plugin } = createGeoSpecMtAssets(stage);
      expect(receipts).toEqual({
        4: '/geospec-mt/permits-4/geospec_engine_native.mt.json',
      });
      const emitted: string[] = [];
      if (typeof plugin.generateBundle !== 'function') {
        throw new TypeError('MT asset plugin has no client emission hook.');
      }
      Reflect.apply(
        plugin.generateBundle,
        {
          emitFile(file: { fileName: string }): string {
            emitted.push(file.fileName);
            return file.fileName;
          },
        },
        [{}, {}, false],
      );
      expect(emitted).toEqual([
        'geospec-mt/permits-4/geospec_engine_native.mt.json',
        'geospec-mt/permits-4/build-receipt.json',
        'geospec-mt/permits-4/geospec_engine_native.mjs',
        'geospec-mt/permits-4/geospec_engine_native.wasm',
        'geospec-mt/permits-4/qualification.json',
      ]);
      const environment = { ...process.env };
      environment['GEOSPEC_MT_STAGED_PACKAGE_ROOT'] = stage;
      const fingerprint = (): string =>
        execFileSync(process.execPath, [path.join(import.meta.dirname, 'geospec-mt-assets-cache-key.ts')], {
          encoding: 'utf8',
          env: environment,
        });
      const before = fingerprint();
      write('qualification.json', JSON.stringify({ ...qualification, verdict: 'failed' }));
      expect(fingerprint()).not.toBe(before);
      expect(() => createGeoSpecMtAssets(stage)).toThrow('qualification is invalid');
      write('qualification.json', JSON.stringify(qualification));
      write('geospec_engine_native.wasm', 'changed');
      expect(() => createGeoSpecMtAssets(stage)).toThrow('staged wasm is invalid');
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });
});

describe('Desktop client and host static delivery', () => {
  // Keep config acquisition and the native build in the same plain Node process.
  // The actual async plugin remains unchanged; no completion sleep or manual hook call is used.
  const staticAssetsBuildSource = `
    import { build, loadConfigFromFile } from 'vite';
    import { existsSync, readFileSync } from 'node:fs';
    import path from 'node:path';
    import { deepStrictEqual } from 'node:assert';
    const configPath = JSON.parse(process.argv[1]);
    const builds = JSON.parse(process.argv[2]);
    const configured = await loadConfigFromFile({ command: 'build', mode: 'production' }, configPath);
    if (!configured || configured.config.build?.copyPublicDir !== false) {
      throw new Error('Actual desktop config did not disable its automatic public copy.');
    }
    const plugin = configured.config.plugins?.find((entry) =>
      entry !== null && typeof entry === 'object' && !Array.isArray(entry) &&
      entry.name === 'vite:desktop-static-assets');
    if (!plugin) {
      throw new Error('Actual desktop config omitted its static delivery owner.');
    }
    for (const options of builds) {
      const writesClient = !options.build.ssr && options.build.write !== false;
      const nativeInput = path.join(options.publicDir, 'assets/engines/replicad/density-single-v1');
      const missingNotice = writesClient && !existsSync(path.join(nativeInput, 'NOTICE'));
      await build({ ...options, configFile: false, plugins: [plugin] });
      if (missingNotice) {
        process.stdout.write('DESKTOP_STATIC_BUILD_RESOLVED_INVALID_INPUT');
        throw new Error('Actual Vite build resolved for incomplete native input.');
      }
      if (writesClient) {
        const host = path.join(path.dirname(options.build.outDir), 'host-assets/engines/replicad/density-single-v1');
        // Assert at build fulfillment, not just after the child event loop has drained.
        for (const name of ['replicad_single.wasm', 'replicad_single.mjs', 'provenance.json',
          'LICENSE', 'LICENSE.OCCT-Exception', 'LICENSE.Replicad', 'NOTICE']) {
          deepStrictEqual(readFileSync(path.join(host, name)), readFileSync(path.join(nativeInput, name)));
        }
      }
    }
  `;

  const buildDesktopStaticAssets = async (
    builds: ReadonlyArray<Pick<InlineConfig, 'root' | 'publicDir' | 'build'>>,
  ): Promise<void> => {
    try {
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          staticAssetsBuildSource,
          JSON.stringify(path.join(import.meta.dirname, 'desktop/vite.config.ts')),
          JSON.stringify(builds),
        ],
        { cwd: import.meta.dirname, encoding: 'utf8' },
      );
    } catch (error) {
      // The command itself contains NOTICE. A late unhandled child rejection must not
      // accidentally satisfy the existing expected build-rejection assertion.
      if (
        typeof error === 'object' &&
        error !== null &&
        'stdout' in error &&
        typeof error.stdout === 'string' &&
        error.stdout.includes('DESKTOP_STATIC_BUILD_RESOLVED_INVALID_INPUT')
      ) {
        throw new Error('Actual build accepted incomplete input before its child exited.', { cause: error });
      }
      // ExecFileSync's generic message embeds the --eval source. Expose only
      // actual child diagnostics, so an unrelated loader failure cannot match NOTICE.
      if (
        typeof error === 'object' &&
        error !== null &&
        'stderr' in error &&
        typeof error.stderr === 'string' &&
        error.stderr.trim().length > 0
      ) {
        throw new Error(error.stderr, { cause: error });
      }
      throw new Error('Static asset build child failed without error output.', { cause: error });
    }
  };

  const fixture = async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tau-desktop-static-'));
    const publicRoot = path.join(root, 'public');
    const nativeInput = path.join(publicRoot, 'assets/engines/replicad/density-single-v1');
    const nativeSource = path.join(import.meta.dirname, 'public/assets/engines/replicad/density-single-v1');
    const clientOutDirectory = path.join(root, 'nonstandard/output/client-variant');
    const nativeHostOutput = path.join(
      path.dirname(clientOutDirectory),
      'host-assets/engines/replicad/density-single-v1',
    );
    const nativeClientOutput = path.join(clientOutDirectory, 'assets/engines/replicad/density-single-v1');
    await mkdir(path.dirname(nativeInput), { recursive: true });
    await cp(nativeSource, nativeInput, { recursive: true });
    await writeFile(path.join(publicRoot, 'ordinary-display.txt'), 'ordinary public bytes');
    await writeFile(path.join(root, 'entry.mjs'), 'export const ordinary = 1;');
    return { root, publicRoot, nativeInput, nativeSource, clientOutDirectory, nativeHostOutput, nativeClientOutput };
  };

  it('should copy actual native closure outside the actual client outDir and remove only stale owned native output', async () => {
    const paths = await fixture();
    try {
      await mkdir(paths.nativeClientOutput, { recursive: true });
      await writeFile(path.join(paths.nativeClientOutput, 'stale.wasm'), 'retired build bytes');
      await mkdir(paths.nativeHostOutput, { recursive: true });
      await writeFile(path.join(paths.nativeHostOutput, 'stale.mjs'), 'retired host bytes');
      await writeFile(path.join(paths.clientOutDirectory, 'unrelated-existing.txt'), 'keep this output');
      await buildDesktopStaticAssets([
        {
          root: paths.root,
          publicDir: paths.publicRoot,
          build: {
            copyPublicDir: false,
            outDir: paths.clientOutDirectory,
            emptyOutDir: false,
            minify: false,
            lib: { entry: path.join(paths.root, 'entry.mjs'), formats: ['es'], fileName: 'entry' },
          },
        },
      ]);
      await expect(readFile(path.join(paths.clientOutDirectory, 'ordinary-display.txt'), 'utf8')).resolves.toBe(
        'ordinary public bytes',
      );
      await expect(readFile(path.join(paths.clientOutDirectory, 'unrelated-existing.txt'), 'utf8')).resolves.toBe(
        'keep this output',
      );
      await expect(readdir(paths.nativeClientOutput)).rejects.toMatchObject({ code: 'ENOENT' });
      const names = await readdir(paths.nativeSource);
      names.sort();
      const hostNames = await readdir(paths.nativeHostOutput);
      expect(hostNames.sort()).toEqual(names);
      expect(names).toEqual([
        'LICENSE',
        'LICENSE.OCCT-Exception',
        'LICENSE.Replicad',
        'NOTICE',
        'provenance.json',
        'replicad_single.mjs',
        'replicad_single.wasm',
      ]);
      await Promise.all(
        names.map(async (name) => {
          const [source, host] = await Promise.all([
            readFile(path.join(paths.nativeSource, name)),
            readFile(path.join(paths.nativeHostOutput, name)),
          ]);
          expect(host.byteLength).toBe(source.byteLength);
          expect(host.equals(source)).toBe(true);
        }),
      );
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it('should leave SSR output and existing client resources untouched even when the native input is absent', async () => {
    const paths = await fixture();
    try {
      await rm(paths.nativeInput, { recursive: true });
      await mkdir(paths.nativeClientOutput, { recursive: true });
      await writeFile(path.join(paths.nativeClientOutput, 'existing.mjs'), 'keep separate client build');
      const serverOutDirectory = path.join(paths.root, 'nonstandard/server-only');
      await buildDesktopStaticAssets([
        {
          root: paths.root,
          publicDir: paths.publicRoot,
          build: {
            copyPublicDir: false,
            outDir: serverOutDirectory,
            ssr: path.join(paths.root, 'entry.mjs'),
            minify: false,
          },
        },
      ]);
      await expect(readFile(path.join(paths.nativeClientOutput, 'existing.mjs'), 'utf8')).resolves.toBe(
        'keep separate client build',
      );
      await expect(readFile(path.join(serverOutDirectory, 'ordinary-display.txt'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(readdir(paths.nativeHostOutput)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readdir(path.join(path.dirname(serverOutDirectory), 'host-assets'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it('should use each actual client environment outDir on repeated builds', async () => {
    const paths = await fixture();
    try {
      const clientOutDirectories = [paths.clientOutDirectory, path.join(paths.root, 'different/copy/client')];
      // One acquired actual plugin is reused inside the same child for both actual environments.
      await buildDesktopStaticAssets(
        clientOutDirectories.map((clientOutDirectory) => ({
          root: paths.root,
          publicDir: paths.publicRoot,
          build: {
            copyPublicDir: false,
            outDir: clientOutDirectory,
            minify: false,
            lib: { entry: path.join(paths.root, 'entry.mjs'), formats: ['es'], fileName: 'entry' },
          },
        })),
      );
      await Promise.all(
        clientOutDirectories.map(async (clientOutDirectory) => {
          await expect(readFile(path.join(clientOutDirectory, 'ordinary-display.txt'), 'utf8')).resolves.toBe(
            'ordinary public bytes',
          );
          await expect(
            readFile(path.join(clientOutDirectory, 'assets/engines/replicad/density-single-v1/replicad_single.wasm')),
          ).rejects.toMatchObject({ code: 'ENOENT' });
          expect(
            await readFile(
              path.join(
                path.dirname(clientOutDirectory),
                'host-assets/engines/replicad/density-single-v1/provenance.json',
              ),
            ),
          ).toEqual(await readFile(path.join(paths.nativeSource, 'provenance.json')));
        }),
      );
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it('should produce no static filesystem output for a client generate-only build', async () => {
    const paths = await fixture();
    try {
      await rm(paths.nativeInput, { recursive: true });
      await buildDesktopStaticAssets([
        {
          root: paths.root,
          publicDir: paths.publicRoot,
          build: {
            write: false,
            copyPublicDir: false,
            outDir: paths.clientOutDirectory,
            minify: false,
            lib: { entry: path.join(paths.root, 'entry.mjs'), formats: ['es'], fileName: 'entry' },
          },
        },
      ]);
      await expect(readdir(paths.clientOutDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readdir(paths.nativeHostOutput)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it('should reject a missing native closure member before mutating prior client or host output', async () => {
    const paths = await fixture();
    try {
      await rm(path.join(paths.nativeInput, 'NOTICE'));
      await mkdir(paths.nativeClientOutput, { recursive: true });
      await writeFile(path.join(paths.nativeClientOutput, 'prior.mjs'), 'prior client');
      await mkdir(paths.nativeHostOutput, { recursive: true });
      await writeFile(path.join(paths.nativeHostOutput, 'prior.mjs'), 'prior host');
      await expect(
        buildDesktopStaticAssets([
          {
            root: paths.root,
            publicDir: paths.publicRoot,
            build: {
              copyPublicDir: false,
              outDir: paths.clientOutDirectory,
              emptyOutDir: false,
              minify: false,
              lib: { entry: path.join(paths.root, 'entry.mjs'), formats: ['es'], fileName: 'entry' },
            },
          },
        ]),
      ).rejects.toThrow('NOTICE');
      await expect(readFile(path.join(paths.nativeClientOutput, 'prior.mjs'), 'utf8')).resolves.toBe('prior client');
      await expect(readFile(path.join(paths.nativeHostOutput, 'prior.mjs'), 'utf8')).resolves.toBe('prior host');
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });
});
