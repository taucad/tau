// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem, RpcGeoSpecClient, RpcGraphicsClient, RpcRuntimeClient } from '@taucad/chat/rpc';
import { toRpcError } from '@taucad/chat/rpc';
import type { LargeObjectsFacet } from '@taucad/revisions';
import { lfsPointerFor } from '@taucad/revisions';
import { guardLargeObjectFiles, guardLargeObjectKernel, isLargeObjectPlaceholder } from '#lib/large-object-guard.js';

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

  it('answers kernel calls with a retryable wait until every object has landed', async () => {
    let facet: LargeObjectsFacet | undefined = downloading;
    const kernelClient = mock<RpcRuntimeClient>();
    const graphics = mock<RpcGraphicsClient>();
    const geospec = mock<RpcGeoSpecClient>();
    kernelClient.evaluateModel.mockResolvedValue(mock());
    graphics.exportModel.mockResolvedValue(mock());
    geospec.runTests.mockResolvedValue(mock());
    const guarded = guardLargeObjectKernel({ kernelClient, graphics, geospec }, () => facet);
    const evaluate = mock<Parameters<RpcRuntimeClient['evaluateModel']>[0]>();
    const exported = mock<Parameters<RpcGraphicsClient['exportModel']>[0]>();
    const tests = mock<Parameters<RpcGeoSpecClient['runTests']>[0]>();

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
});
