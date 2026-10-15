// @vitest-environment node
/*
 * The PicoGK closure end to end on any host: the checked-in tau-plugin.json, with its two pins swapped for in-test
 * archives shaped like Microsoft's runtime archive and the Tau layer, prepared offline from a seed by the real
 * preparation host for a darwin-arm64 host, then mapped to kernel options. It proves the payload destinations, the
 * seed index for a sha512 pin and the launch set without the native engine, which only darwin-arm64 runs (D13).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import { createPreparationHost, parsePluginDeployment } from '@taucad/runtime/preparation/node';
import type { HostIndicators } from '@taucad/runtime/preparation/node';
import { afterEach, describe, expect, it } from 'vitest';

import { picogkOptionsFromClosure } from '#picogk-closure.js';
import { composeManifest } from '#picogk-layer.js';
import type { PicogkLayerRecord } from '#picogk-layer.js';

type Member = { readonly name: string; readonly text: string; readonly executable?: boolean };

/** A gzipped ustar archive of regular files, the shape both payloads have. */
const tarGz = (members: readonly Member[]): Uint8Array<ArrayBuffer> => {
  const blocks: Array<Uint8Array<ArrayBuffer>> = [];
  for (const { name, text, executable } of members) {
    const data = new TextEncoder().encode(text);
    const header = Buffer.alloc(512);
    header.write(name, 0);
    header.write(`${(executable === true ? 0o755 : 0o644).toString(8).padStart(7, '0')}\0`, 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.write('0', 156);
    header.write('ustar\u000000', 257);
    header.fill(0x20, 148, 156);
    header.write(
      `${header
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, '0')}\0 `,
      148,
    );
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return new Uint8Array(gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)])));
};

const runtimeVersion = '10.0.11';
const runtimeArchive = tarGz([
  { name: 'dotnet', text: 'muxer', executable: true },
  { name: 'LICENSE.txt', text: 'MIT' },
  { name: `host/fxr/${runtimeVersion}/libhostfxr.dylib`, text: 'hostfxr' },
  { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/libhostpolicy.dylib`, text: 'hostpolicy' },
  { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/libcoreclr.dylib`, text: 'coreclr' },
  { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/libclrjit.dylib`, text: 'clrjit' },
  { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/System.Private.CoreLib.dll`, text: 'corelib' },
  { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/System.Linq.dll`, text: 'linq' },
]);
const layerArchive = tarGz([
  { name: 'Tau.PicoGK.Worker.dll', text: 'worker' },
  { name: 'Tau.PicoGK.Worker.runtimeconfig.json', text: '{}' },
  { name: 'Tau.PicoGK.Worker.deps.json', text: '{}' },
  { name: 'PicoGK.dll', text: 'picogk' },
  { name: 'picogk.26.2.dylib', text: 'engine' },
  { name: 'libSkiaSharp.dylib', text: 'skia' },
  { name: 'Microsoft.CodeAnalysis.dll', text: 'roslyn' },
]);

const hex = (algorithm: 'sha256' | 'sha512', bytes: Uint8Array<ArrayBuffer>): string =>
  createHash(algorithm).update(bytes).digest('hex');
const sha512Integrity = `sha512-${createHash('sha512').update(runtimeArchive).digest('base64')}`;
const layerRecord: PicogkLayerRecord = {
  schemaVersion: 2,
  target: 'darwin-arm64',
  asset: 'tau-picogk-layer-darwin-arm64.tar.gz',
  sha256: hex('sha256', layerArchive),
  byteLength: layerArchive.byteLength,
  unpackedByteLength: 1000,
  fileCount: 7,
  protocolVersion: 8,
  dotnetRuntimeVersion: runtimeVersion,
  readyToRun: true,
  sourceFilesSha256: '0'.repeat(64),
  nativeSourceSha256: '1'.repeat(64),
  toolchain: { dotnetSdk: '10.0.400', compiler: 'clang', sdk: '26.2', cmake: 'cmake version 4.4.4', ninja: '1.13.2' },
};
const darwinArm64: HostIndicators = {
  os: 'darwin',
  arch: 'arm64',
  osVersion: '15.7',
  translated: false,
  wasm: { threads: true },
};

/** The checked-in manifest with the runtime pin moved to the in-test archive and the layer pin composed. */
const testManifest = (): Record<string, unknown> => {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../tau-plugin.json'), 'utf8')) as {
    dependencies: { runtime: Array<{ payloads: Array<Record<string, unknown>> }> };
  };
  const dotnet = manifest.dependencies.runtime[0]!.payloads.find(({ name }) => name === 'dotnet')!;
  dotnet['integrity'] = sha512Integrity;
  dotnet['byteLength'] = runtimeArchive.byteLength;
  return composeManifest(manifest, layerRecord);
};

describe('PicoGK closure preparation', () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  });

  it('seals the runtime archive and the layer side by side and launches the worker through the muxer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-picogk-closure-'));
    roots.push(root);
    const seed = join(root, 'seed');
    await mkdir(join(seed, 'blobs/sha256'), { recursive: true });
    await writeFile(join(seed, 'blobs/sha256', hex('sha256', runtimeArchive)), runtimeArchive);
    await writeFile(join(seed, 'blobs/sha256', layerRecord.sha256), layerArchive);
    await writeFile(
      join(seed, 'tau-seed.json'),
      JSON.stringify({
        closures: [
          { payloads: [{ integrity: sha512Integrity, blob: `blobs/sha256/${hex('sha256', runtimeArchive)}` }] },
        ],
      }),
    );
    const host = createPreparationHost({
      plugins: [{ package: '@taucad/picogk', deployment: parsePluginDeployment(testManifest(), 'test manifest') }],
      store: join(root, 'store'),
      seed,
      indicators: darwinArm64,
    });

    const outcome = await host.prepare({
      package: '@taucad/picogk',
      offline: true,
      signal: new AbortController().signal,
    });

    expect(outcome.status).toBe('ready');
    const receipt = outcome.status === 'ready' ? outcome.receipts['runtime'] : undefined;
    expect(receipt).toBeDefined();
    const options = picogkOptionsFromClosure(receipt!);
    expect(options.runtimePath).toBe(receipt!.root);
    expect(options.workerExecutable).toBe(join(receipt!.root, 'dotnet/dotnet'));
    expect(options.workerArguments).toEqual([join(receipt!.root, 'tau-worker/Tau.PicoGK.Worker.dll')]);
    expect(await readFile(options.workerExecutable, 'utf8')).toBe('muxer');
    expect(existsSync(options.workerArguments[0]!)).toBe(true);
    for (const { path, sha256 } of [
      { path: options.workerExecutable, sha256: options.workerSha256 },
      ...options.resourceFiles,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of small files
      expect(hex('sha256', new Uint8Array(await readFile(path))), path).toBe(sha256);
    }
    expect(options.resourceFiles.map(({ path }) => path.slice(receipt!.root.length + 1))).toEqual([
      'dotnet/host/fxr/10.0.11/libhostfxr.dylib',
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/System.Private.CoreLib.dll',
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libclrjit.dylib',
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libcoreclr.dylib',
      'dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.dylib',
      'tau-worker/PicoGK.dll',
      'tau-worker/Tau.PicoGK.Worker.deps.json',
      'tau-worker/Tau.PicoGK.Worker.dll',
      'tau-worker/Tau.PicoGK.Worker.runtimeconfig.json',
      'tau-worker/libSkiaSharp.dylib',
      'tau-worker/picogk.26.2.dylib',
    ]);
  });
});
