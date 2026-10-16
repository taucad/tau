import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMcpViewerExport, listKernelExportFormats } from '#mcp-viewer-export.js';
import type { ViewerExportRoute, ViewerExportRuntime } from '#mcp-viewer-export.js';
import type { HostRuntimeClient } from '#agent-tools.js';

/** The host's runtime client is what the server passes as `runtimeFor`'s result. */
export const hostRuntimeIsViewerExportRuntime = (client: HostRuntimeClient): ViewerExportRuntime => client;

const stlOptions = {
  schema: { type: 'object', properties: { binary: { type: 'boolean' } } },
  defaults: { binary: true },
};
const none = { schema: {}, defaults: {} };

const routes: ViewerExportRoute[] = [
  {
    targetFormat: 'stl',
    kernelId: 'replicad',
    fidelity: 'mesh',
    exportOptions: stlOptions,
  },
  {
    targetFormat: 'step',
    kernelId: 'replicad',
    fidelity: 'brep',
    exportOptions: none,
  },
  {
    targetFormat: 'glb',
    kernelId: 'replicad',
    transcoderId: 'converter',
    fidelity: 'mesh',
    exportOptions: none,
  },
  {
    targetFormat: 'glb',
    kernelId: 'replicad',
    fidelity: 'mesh',
    exportOptions: none,
  },
  {
    targetFormat: 'obj',
    kernelId: 'replicad',
    transcoderId: 'converter',
    fidelity: 'mesh',
    exportOptions: none,
  },
  {
    targetFormat: 'stl',
    kernelId: 'openrscad',
    fidelity: 'mesh',
    exportOptions: none,
  },
];

describe('listKernelExportFormats', () => {
  it("should reduce each of the kernel's formats to its best route, sorted", () => {
    expect(listKernelExportFormats(routes, 'replicad')).toEqual([
      { format: 'glb', fidelity: 'mesh', direct: true, provider: 'replicad' },
      {
        format: 'obj',
        fidelity: 'mesh',
        direct: false,
        provider: 'replicad+converter',
      },
      { format: 'step', fidelity: 'brep', direct: true, provider: 'replicad' },
      {
        format: 'stl',
        fidelity: 'mesh',
        direct: true,
        provider: 'replicad',
        exportOptions: stlOptions,
      },
    ]);
  });

  it('should prefer a BREP route over a mesh one for the same format', () => {
    const formats = listKernelExportFormats(
      [
        {
          targetFormat: 'step',
          kernelId: 'k',
          transcoderId: 't',
          fidelity: 'mesh',
          exportOptions: none,
        },
        {
          targetFormat: 'step',
          kernelId: 'k',
          transcoderId: 't',
          fidelity: 'brep',
          exportOptions: none,
        },
      ],
      'k',
    );
    expect(formats).toEqual([{ format: 'step', fidelity: 'brep', direct: false, provider: 'k+t' }]);
  });
});

describe('createMcpViewerExport', () => {
  let root: string;
  const runtime: ViewerExportRuntime = {
    capabilities: { routes },
    connect: vi.fn(async () => undefined),
    describe: vi.fn(async () => ({ kernelId: 'replicad' })),
  };
  const handlers = createMcpViewerExport({ runtimeFor: async () => runtime });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-viewer-export-'));
    await mkdir(join(root, '.tau/artifacts/abc'), { recursive: true });
    await writeFile(join(root, '.tau/artifacts/abc/model.stl'), 'solid model');
    await writeFile(join(root, 'secret.txt'), 'no');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("should list the formats of the entry's kernel", async () => {
    const result = await handlers.formats(root, { targetFile: 'model.ts' });
    expect(runtime.describe).toHaveBeenCalledWith({
      source: { path: 'model.ts' },
    });
    expect(result).toEqual({ kernelId: 'replicad', formats: listKernelExportFormats(routes, 'replicad') });
  });

  it('should refuse an entry outside the project and report a runtime failure', async () => {
    expect(await handlers.formats(root, { targetFile: '../other.ts' })).toMatchObject({
      errorCode: 'PATH_OUTSIDE_PROJECT',
    });
    const failing = createMcpViewerExport({
      runtimeFor: async () => ({
        ...runtime,
        describe: async () => {
          throw new Error('no kernel');
        },
      }),
    });
    expect(await failing.formats(root, { targetFile: 'model.ts' })).toEqual({
      errorCode: 'FORMATS_UNAVAILABLE',
      message: 'no kernel',
    });
    const unknown = createMcpViewerExport({
      runtimeFor: async () => ({ ...runtime, describe: async () => ({}) }),
    });
    expect(await unknown.formats(root, { targetFile: 'notes.txt' })).toMatchObject({ errorCode: 'NO_KERNEL' });
  });

  it('should copy finished artifacts under exports/', async () => {
    const result = await handlers.save(root, {
      directory: 'exports/stl',
      files: [{ artifactPath: '.tau/artifacts/abc/model.stl', name: 'model.stl' }],
    });
    expect(result).toEqual({
      files: [{ path: 'exports/stl/model.stl', byteLength: 11 }],
    });
    expect(await readFile(join(root, 'exports/stl/model.stl'), 'utf8')).toBe('solid model');
    expect(
      await handlers.save(root, {
        directory: 'exports',
        files: [{ artifactPath: '.tau/artifacts/abc/model.stl', name: 'model.stl' }],
      }),
    ).toEqual({ files: [{ path: 'exports/model.stl', byteLength: 11 }] });
  });

  it('should copy only artifacts, and only into exports/', async () => {
    expect(
      await handlers.save(root, {
        directory: 'exports',
        files: [{ artifactPath: 'secret.txt', name: 'secret.txt' }],
      }),
    ).toMatchObject({ errorCode: 'NOT_AN_ARTIFACT' });
    expect(
      await handlers.save(root, {
        directory: 'src',
        files: [{ artifactPath: '.tau/artifacts/abc/model.stl', name: 'model.stl' }],
      }),
    ).toMatchObject({ errorCode: 'PATH_OUTSIDE_EXPORTS' });
    expect(
      await handlers.save(root, {
        directory: 'exports',
        files: [
          {
            artifactPath: '.tau/artifacts/abc/model.stl',
            name: '../model.stl',
          },
        ],
      }),
    ).toMatchObject({ errorCode: 'PATH_OUTSIDE_EXPORTS' });
  });

  it('should read an artifact in ranges and refuse other files', async () => {
    expect(
      await handlers.readArtifact(root, {
        artifactPath: '.tau/artifacts/abc/model.stl',
        offset: 6,
        length: 100,
      }),
    ).toEqual({
      offset: 6,
      byteLength: 5,
      totalBytes: 11,
      data: Buffer.from('model').toString('base64'),
    });
    expect(
      await handlers.readArtifact(root, {
        artifactPath: 'secret.txt',
        offset: 0,
        length: 10,
      }),
    ).toMatchObject({
      errorCode: 'NOT_AN_ARTIFACT',
    });
    expect(
      await handlers.readArtifact(root, {
        artifactPath: '.tau/artifacts/missing.stl',
        offset: 0,
        length: 10,
      }),
    ).toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});
