/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- defineKernel intentionally erases private backend context */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockKernelRuntime, validateGlbData } from '@taucad/runtime-testing';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import type * as RuntimeKernel from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { digests } from 'cadmpeg-ts/digests';

import { cadmpegKernel } from '#cadmpeg.kernel.js';
import { cadmpegTranscoder } from '#cadmpeg.transcoder.js';

// Run the plugin as it runs in a browser worker: not a Node.js realm, so no native addon and no
// packaged locator. Only the plugin's realm check is replaced; cadmpeg-ts, its glue and the
// WebAssembly modules are the installed ones.
vi.mock('@taucad/runtime/kernel', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeKernel>()),
  isNode: () => false,
}));

const packageRoot = dirname(createRequire(import.meta.url).resolve('cadmpeg-ts/package.json'));
const installedModule = (id: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(join(packageRoot, 'dist/wasm', `${id}_bg.wasm`)));
const base = 'https://dependencies.example.test/';

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ftc06 = new Uint8Array(readFileSync(new URL('fixtures/ftc06.sldprt', import.meta.url)));
const cube = new Uint8Array(readFileSync(new URL('fixtures/cube.step', import.meta.url)));

/** One initialized kernel, and a function that opens FTC 06 with it. */
const openFtc06 = async (options: { engines: { baseUrl: string; layout: 'digest' | 'package' } }) => {
  const definition = await resolveRuntimePluginDefinition('kernel', cadmpegKernel(options));
  const runtime = createMockKernelRuntime();
  runtime.filesystem.mocks.readdir.mockResolvedValue(['ftc06.sldprt']);
  runtime.filesystem.mocks.stat.mockResolvedValue({ type: 'file', size: ftc06.length, mtimeMs: 0 });
  runtime.filesystem.mocks.readFile.mockResolvedValue(ftc06);
  const context = await definition.initialize(options, runtime);
  return async () => definition.evaluate({ entryPath: 'ftc06.sldprt', parameters: {}, options: {} }, runtime, context);
};

const transcoderClient = (transcoder: ReturnType<typeof cadmpegTranscoder>) =>
  createRuntimeClient({
    transport: inProcessTransport({
      runtime: defineRuntime({ transcoders: [transcoder] }),
      fileSystem: fromMemoryFs({}),
    }),
  });
const stepTo = async (client: ReturnType<typeof transcoderClient>, to: 'fcstd' | 'sldprt') =>
  client.transcode({
    from: 'step',
    to,
    files: [{ name: 'cube.step', bytes: cube, mimeType: 'model/step' }],
    options: {},
  });

describe('cadmpeg in a browser realm', () => {
  it('refuses to initialize the kernel without engines', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', cadmpegKernel());
    await expect(definition.initialize({}, createMockKernelRuntime())).rejects.toMatchObject({
      issues: [
        {
          code: 'KERNEL_NOT_PREPARED',
          type: 'kernel',
          severity: 'error',
          details: { producer: 'cadmpeg', environment: 'browser' },
        },
      ],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports KERNEL_NOT_PREPARED from the transcoder without engines', async () => {
    const client = transcoderClient(cadmpegTranscoder());
    try {
      expect(await stepTo(client, 'fcstd')).toMatchObject({
        success: false,
        issues: [{ code: 'KERNEL_NOT_PREPARED', details: { producer: 'cadmpeg', environment: 'browser' } }],
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await client.shutdown();
    }
  });

  it('imports a SOLIDWORKS part through one verified gzip engine, after a refused one, without a reload', async () => {
    const blob = `${base}blobs/sha256/${digests.sldprt.gzip.sha256}`;
    const open = await openFtc06({ engines: { baseUrl: base, layout: 'digest' } });
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    await expect(open()).rejects.toMatchObject({
      issues: [
        {
          code: 'KERNEL_BINDING_FAILED',
          details: { producer: 'cadmpeg', engineFailure: 'status', status: 404, format: 'sldprt' },
        },
      ],
    });
    // The release asset is zlib level 9 with no name and a zero mtime, which Node reproduces byte for byte.
    const gzip = gzipSync(installedModule('sldprt'), { level: 9 });
    fetchMock.mockImplementation(async () => new Response(new Uint8Array(gzip)));
    const result = await open();
    validateGlbData(result.handle);
    // One request per attempt, for the engine of the opened format, by the digest the package states.
    expect(fetchMock.mock.calls).toEqual([
      [blob, { redirect: 'error' }],
      [blob, { redirect: 'error' }],
    ]);
  }, 120_000);

  it('loads a writer from the package layout and reports a refused engine as a transcoder issue', async () => {
    const client = transcoderClient(cadmpegTranscoder({ engines: { baseUrl: base, layout: 'package' } }));
    const toFcstd = async () => stepTo(client, 'fcstd');
    try {
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 302, headers: new Headers([['Location', 'https://elsewhere.test/']]) }),
      );
      expect(await toFcstd()).toMatchObject({
        success: false,
        issues: [
          {
            code: 'TRANSCODER_EXECUTION_FAILED',
            details: { producer: 'cadmpeg', engineFailure: 'redirect', format: 'fcstd' },
          },
        ],
      });
      fetchMock.mockImplementation(async () => new Response(new Uint8Array(installedModule('fcstd'))));
      // The module loads and verifies; cadmpeg 0.6.12's FreeCAD writer then refuses a model read from STEP.
      const result = await toFcstd();
      expect(result.issues[0]?.message).toContain('cadmpeg REFUSED (export)');
      expect(fetchMock).toHaveBeenLastCalledWith(`${base}fcstd_bg.wasm`, { redirect: 'error' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      await client.shutdown();
    }
  }, 120_000);
});
