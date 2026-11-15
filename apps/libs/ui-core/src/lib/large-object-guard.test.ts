// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem, RpcGeoSpecClient, RpcGraphicsClient, RpcRuntimeClient } from '@taucad/chat/rpc';
import { toRpcError } from '@taucad/chat/rpc';
import type { LargeObjectsFacet, ProjectReadiness } from '@taucad/revisions';
import { lfsPointerFor } from '@taucad/revisions';
import {
  closureHasPending,
  guardLargeObjectFiles,
  guardLargeObjectKernel,
  isLargeObjectPlaceholder,
  kernelClosure,
  workspaceMirrorKernels,
} from '#lib/large-object-guard.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const placeholder = lfsPointerFor(encoder.encode('solid part')).bytes;
const source = encoder.encode('import("models/part.step");\n');

/* A filesystem of two files: a model still downloading, and its source. */
const filesystem = (): Readonly<{ files: Map<string, Uint8Array<ArrayBuffer>>; fileSystem: RpcFileSystem }> => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>([
    ['/models/part.step', placeholder],
    ['/main.scad', source],
  ]);
  const read = (path: string): Uint8Array<ArrayBuffer> => {
    const bytes = files.get(path);
    if (bytes === undefined) {
      throw Object.assign(new Error(`${path} not found`), { code: 'ENOENT' });
    }
    return bytes;
  };
  const fileSystem = mock<RpcFileSystem>();
  fileSystem.readFile.mockImplementation(async (path) => decoder.decode(read(path)));
  fileSystem.readBinaryFile.mockImplementation(async (path) => read(path));
  /* The index's answer: which files are still placeholders, known without a read. */
  fileSystem.pendingPaths = async (paths) => paths.filter((path) => files.get(path) === placeholder);
  fileSystem.writeFile.mockImplementation(async (path, content) => {
    files.set(path, encoder.encode(content));
  });
  fileSystem.appendFile.mockImplementation(async (path, content) => {
    files.set(path, encoder.encode(decoder.decode(read(path)) + content));
  });
  fileSystem.deleteFile.mockImplementation(async (path) => {
    files.delete(path);
  });
  fileSystem.stat.mockImplementation(async (path) => ({
    size: read(path).byteLength,
    isDirectory: false,
    createdAt: '',
    modifiedAt: '',
    contentKind: 'binary',
  }));
  return { files, fileSystem };
};

const downloading: LargeObjectsFacet = {
  phase: 'fetching',
  paths: ['models/part.step'],
  objects: 1,
  totalObjects: 3,
  bytes: 10,
  totalBytes: 30,
};

describe('the agent tools while large objects download', () => {
  it('knows a pointer from a file that only looks like one', () => {
    expect(isLargeObjectPlaceholder(placeholder)).toBe(true);
    expect(isLargeObjectPlaceholder(encoder.encode('version 1\n'))).toBe(false);
    expect(isLargeObjectPlaceholder(new Uint8Array(4096))).toBe(false);
  });

  it('refuses to read a placeholder, retryably, and reads every other file', async () => {
    const guarded = guardLargeObjectFiles(filesystem().fileSystem);
    const refusal: unknown = await guarded.readFile('/models/part.step').catch((error: unknown) => error);
    expect(refusal).toMatchObject({ code: 'OPERATION_TIMEOUT', retryable: true });
    expect(toRpcError(refusal)).toMatchObject({ errorCode: 'OPERATION_TIMEOUT', retryable: true });
    await expect(guarded.readBinaryFile('/models/part.step')).rejects.toMatchObject({ retryable: true });
    await expect(guarded.readFile('/main.scad')).resolves.toBe('import("models/part.step");\n');
  });

  it('refuses a write, an edit or an append over a placeholder, and leaves its pointer on disk', async () => {
    const { files, fileSystem } = filesystem();
    const guarded = guardLargeObjectFiles(fileSystem);
    await expect(guarded.writeFile('/models/part.step', 'solid mine')).rejects.toMatchObject({ retryable: true });
    await expect(guarded.appendFile('/models/part.step', 'more')).rejects.toMatchObject({ retryable: true });
    await expect(
      guarded.editFile({ targetFile: '/models/part.step', oldString: 'oid', newString: 'x' }),
    ).rejects.toMatchObject({ retryable: true });
    await expect(
      guarded.writeFileChecked({ path: '/models/part.step', data: 'x', preconditions: [] }),
    ).rejects.toMatchObject({ retryable: true });
    expect(files.get('/models/part.step')).toStrictEqual(placeholder);
    /* Decided from the index: a read of a pending entry would fetch its object. */
    expect(fileSystem.readBinaryFile).not.toHaveBeenCalled();
    expect(fileSystem.editFile).not.toHaveBeenCalled();
    expect(fileSystem.writeFileChecked).not.toHaveBeenCalled();

    await guarded.writeFile('/main.scad', 'cube(1);\n');
    await guarded.writeFile('/new.scad', 'cube(2);\n');
    expect(decoder.decode(files.get('/main.scad'))).toBe('cube(1);\n');
    expect(decoder.decode(files.get('/new.scad'))).toBe('cube(2);\n');
    /* Deleting one is the person's call, not a read of its pointer. */
    await guarded.deleteFile('/models/part.step');
    expect(files.has('/models/part.step')).toBe(false);
  });

  it('refuses a write, retryably, when the index cannot say whether the file is pending', async () => {
    const { files, fileSystem } = filesystem();
    fileSystem.pendingPaths = async () => {
      throw new Error('The project index could not open.');
    };
    const guarded = guardLargeObjectFiles(fileSystem);
    await expect(guarded.writeFile('/models/part.step', 'solid mine')).rejects.toMatchObject({
      code: 'OPERATION_TIMEOUT',
      retryable: true,
    });
    expect(files.get('/models/part.step')).toStrictEqual(placeholder);
    expect(fileSystem.readBinaryFile).not.toHaveBeenCalled();
  });

  /* A host that predates the index query: the guard checks the bytes, and refuses on anything but absence. */
  it('checks the bytes when the host cannot answer, and refuses unless the file is absent', async () => {
    const { files, fileSystem } = filesystem();
    fileSystem.pendingPaths = async () => {
      throw Object.assign(new Error('This workspace bridge cannot say which files are pending.'), {
        code: 'PENDING_PATHS_UNSUPPORTED',
      });
    };
    const guarded = guardLargeObjectFiles(fileSystem);
    await expect(guarded.writeFile('/models/part.step', 'solid mine')).rejects.toMatchObject({ retryable: true });
    expect(files.get('/models/part.step')).toStrictEqual(placeholder);
    await guarded.writeFile('/new.scad', 'cube(2);\n');
    expect(decoder.decode(files.get('/new.scad'))).toBe('cube(2);\n');

    /* Such a host's read of a pending entry refuses with PENDING rather than answer its pointer. */
    vi.mocked(fileSystem.readBinaryFile).mockRejectedValueOnce(
      Object.assign(new Error('The large object of models/part.step is not here yet.'), { code: 'PENDING' }),
    );
    await expect(guarded.writeFile('/models/part.step', 'solid mine')).rejects.toThrow('still downloading from');
    vi.mocked(fileSystem.stat).mockRejectedValueOnce(Object.assign(new Error('The storage is busy.'), { code: 'EIO' }));
    await expect(guarded.writeFile('/models/part.step', 'solid mine')).rejects.toMatchObject({
      code: 'OPERATION_TIMEOUT',
      retryable: true,
    });
    expect(files.get('/models/part.step')).toStrictEqual(placeholder);
  });

  it('answers kernel calls with a retryable wait until every object their closure reads has landed', async () => {
    let facet: LargeObjectsFacet | undefined = downloading;
    const kernelClient = mock<RpcRuntimeClient>();
    const graphics = mock<RpcGraphicsClient>();
    const geospec = mock<RpcGeoSpecClient>();
    kernelClient.evaluateModel.mockResolvedValue(mock());
    graphics.exportModel.mockResolvedValue(mock());
    geospec.runTests.mockResolvedValue(mock());
    const guarded = guardLargeObjectKernel({ kernelClient, graphics, geospec }, () => facet);
    /* A workspace-mirroring kernel (build123d) copies every file, the pending one among them. */
    const evaluate: Parameters<RpcRuntimeClient['evaluateModel']>[0] = { targetFile: 'main.py' };
    const exported: Parameters<RpcGraphicsClient['exportModel']>[0] = { targetFile: 'main.py', to: 'stl' };
    const tests: Parameters<RpcGeoSpecClient['runTests']>[0] = {};

    const waiting = await guarded.kernelClient.evaluateModel(evaluate);
    expect(waiting).toMatchObject({ success: false, errorCode: 'OPERATION_TIMEOUT', retryable: true });
    expect(JSON.stringify(waiting)).toContain('1 of 3');
    await expect(guarded.graphics.exportModel(exported)).resolves.toMatchObject({ retryable: true });
    await expect(guarded.geospec.runTests(tests)).resolves.toMatchObject({ retryable: true });
    facet = { ...downloading, phase: 'failed', error: 'offline' };
    expect(JSON.stringify(await guarded.kernelClient.evaluateModel(evaluate))).toContain('offline');
    expect(kernelClient.evaluateModel).not.toHaveBeenCalled();

    facet = undefined;
    await guarded.kernelClient.evaluateModel(evaluate);
    await guarded.graphics.exportModel(exported);
    await guarded.geospec.runTests(tests);
    expect(kernelClient.evaluateModel).toHaveBeenCalledWith(evaluate, undefined);
    expect(graphics.exportModel).toHaveBeenCalledTimes(1);
    expect(geospec.runTests).toHaveBeenCalledTimes(1);
  });

  /* T6: a kernel that reads only its entry runs while other objects download; a pending path it reads goes through. */
  it('runs a kernel call whose closure holds no pending object, and stays gated for a failed fill', async () => {
    let facet: LargeObjectsFacet | undefined = downloading;
    const kernelClient = mock<RpcRuntimeClient>();
    const graphics = mock<RpcGraphicsClient>();
    kernelClient.evaluateModel.mockResolvedValue(mock());
    graphics.exportModel.mockResolvedValue(mock());
    const guarded = guardLargeObjectKernel({ kernelClient, graphics }, () => facet);
    const evaluate: Parameters<RpcRuntimeClient['evaluateModel']>[0] = { targetFile: 'main.scad' };
    const exported: Parameters<RpcGraphicsClient['exportModel']>[0] = { targetFile: 'main.scad', to: 'stl' };

    await guarded.kernelClient.evaluateModel(evaluate);
    await guarded.graphics.exportModel(exported);
    expect(kernelClient.evaluateModel).toHaveBeenCalledWith(evaluate, undefined);
    expect(graphics.exportModel).toHaveBeenCalledTimes(1);

    const ofPart: Parameters<RpcRuntimeClient['evaluateModel']>[0] = { targetFile: 'models/part.step' };
    await expect(guarded.kernelClient.evaluateModel(ofPart)).resolves.toMatchObject({ retryable: true });
    facet = { ...downloading, phase: 'failed', error: 'offline' };
    await expect(guarded.kernelClient.evaluateModel(evaluate)).resolves.toMatchObject({ retryable: true });
    expect(kernelClient.evaluateModel).toHaveBeenCalledTimes(1);
  });

  /* `materialized` with no facet is a fill that has not reported yet: a mirroring kernel would copy pointers. */
  it('holds a mirroring kernel call until the fill has reported, and lets an entry-only call through', async () => {
    let readiness: ProjectReadiness | undefined = 'materialized';
    const kernelClient = mock<RpcRuntimeClient>();
    const geospec = mock<RpcGeoSpecClient>();
    kernelClient.evaluateModel.mockResolvedValue(mock());
    geospec.runTests.mockResolvedValue(mock());
    const guarded = guardLargeObjectKernel(
      { kernelClient, geospec },
      () => undefined,
      () => readiness,
    );
    const mirrored: Parameters<RpcRuntimeClient['evaluateModel']>[0] = { targetFile: 'main.py' };
    const entryOnly: Parameters<RpcRuntimeClient['evaluateModel']>[0] = { targetFile: 'main.scad' };

    await expect(guarded.kernelClient.evaluateModel(mirrored)).resolves.toMatchObject({
      success: false,
      errorCode: 'OPERATION_TIMEOUT',
      retryable: true,
    });
    await expect(guarded.geospec.runTests({})).resolves.toMatchObject({ retryable: true });
    await guarded.kernelClient.evaluateModel(entryOnly);
    expect(kernelClient.evaluateModel).toHaveBeenCalledExactlyOnceWith(entryOnly, undefined);

    readiness = 'filled';
    await guarded.kernelClient.evaluateModel(mirrored);
    await guarded.geospec.runTests({});
    expect(kernelClient.evaluateModel).toHaveBeenCalledTimes(2);
    expect(geospec.runTests).toHaveBeenCalledTimes(1);
  });
});

describe('kernel closure', () => {
  it('is the manifest and the entry for a kernel that reads only what it opens', () => {
    expect(kernelClosure('main.scad')).toStrictEqual(['tau.json', 'main.scad']);
    expect(kernelClosure('main.ts', 'replicad')).toStrictEqual(['tau.json', 'main.ts']);
    expect(kernelClosure('')).toStrictEqual(['tau.json']);
  });
  /* A workspace mirror lists sizes raw and reads through, so a pending pointer reads as "changed while mirroring". */
  it('is the whole workspace for a kernel that mirrors it, named or known only by its entry', () => {
    expect(kernelClosure('main.py', 'build123d')).toBe('workspace');
    expect(kernelClosure('main.cs', 'picogk')).toBe('workspace');
    expect(kernelClosure('main.py')).toBe('workspace');
    expect(kernelClosure('main.cs')).toBe('workspace');
    expect(kernelClosure('main.ts', 'picovoxel')).toStrictEqual(['tau.json', 'main.ts']);
  });
  it('is pending when a closure path is, or for a workspace closure when anything is', () => {
    expect(closureHasPending(['tau.json', 'main.ts'], ['assets/a.png'])).toBe(false);
    expect(closureHasPending(['tau.json', 'main.ts'], ['main.ts'])).toBe(true);
    expect(closureHasPending('workspace', ['assets/a.png'])).toBe(true);
    expect(closureHasPending('workspace', [])).toBe(false);
  });
});

/*
 * The mirror set is named by hand (the catalog has no capability for it), so it is checked against the plugins
 * themselves: a kernel plugin mirrors the workspace when it builds on a core that does (`createPythonWorkspaceMirror`,
 * `createDotnetWorkspaceMirror`, the native-process `createWorkspaceMirror`). A new one cannot fail open unnoticed.
 */
describe('workspace-mirroring kernels', () => {
  const mirrorCores = ['@taucad/python-kernel-core', '@taucad/dotnet-kernel-core', '@taucad/native-process-core'];
  const pluginsDirectory = fileURLToPath(new URL('../../../../../packages/plugins/', import.meta.url));

  it('are exactly the kernel plugins built on a workspace-mirroring core', async () => {
    const plugins = await readdir(pluginsDirectory, { withFileTypes: true });
    const mirroring: string[] = [];
    for (const plugin of plugins.filter((entry) => entry.isDirectory())) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of manifests, read in order.
      const manifest = JSON.parse(await readFile(join(pluginsDirectory, plugin.name, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      if (mirrorCores.some((core) => Object.hasOwn(manifest.dependencies ?? {}, core))) {
        mirroring.push(plugin.name);
      }
    }
    expect(mirroring.length).toBeGreaterThan(0);
    expect(new Set(mirroring)).toStrictEqual(new Set(workspaceMirrorKernels));
  });
});
