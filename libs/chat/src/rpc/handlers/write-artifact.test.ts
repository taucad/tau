import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ExportFile } from '@taucad/types';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { slugifyTargetFile, writeArtifactSet } from '#rpc/handlers/write-artifact.js';

const file = (name: string, bytes: number[]): ExportFile => ({
  name,
  mimeType: 'application/octet-stream',
  bytes: new Uint8Array(bytes),
});

describe('writeArtifactSet helpers', () => {
  it('should slugify path separators and disallowed chars', () => {
    expect(slugifyTargetFile('lib/sub/PEN.ts')).toBe('lib_sub_PEN.ts');
    expect(slugifyTargetFile('unicode-名前.ts')).toBe('unicode-__.ts');
    expect(slugifyTargetFile('a/../b.ts')).toBe('a_.._b.ts');
  });

  it('should persist every artifact in producer order under one export directory', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.writeBinaryFile.mockResolvedValue(undefined);

    const result = await writeArtifactSet(
      {
        toolCallId: 'tc-7',
        targetFile: 'src/main.ts',
        format: 'gltf',
        files: [file('model.gltf', [1, 2]), file('buffers/model.bin', [3])],
      },
      fileSystem,
    );

    expect(result).toEqual([
      {
        name: 'model.gltf',
        artifactPath: '.tau/artifacts/tc-7__src_main.ts-gltf/model.gltf',
        mimeType: 'application/octet-stream',
        byteLength: 2,
      },
      {
        name: 'buffers/model.bin',
        artifactPath: '.tau/artifacts/tc-7__src_main.ts-gltf/buffers/model.bin',
        mimeType: 'application/octet-stream',
        byteLength: 1,
      },
    ]);
    expect(fileSystem.writeBinaryFile.mock.calls).toEqual([
      ['.tau/artifacts/tc-7__src_main.ts-gltf/model.gltf', new Uint8Array([1, 2])],
      ['.tau/artifacts/tc-7__src_main.ts-gltf/buffers/model.bin', new Uint8Array([3])],
    ]);
  });

  it.each([
    { label: 'empty', files: [] },
    { label: 'unsafe', files: [file('../model.bin', [1])] },
    { label: 'duplicate', files: [file('model.bin', [1]), file('model.bin', [2])] },
  ])('should reject $label artifact sets before writing', async ({ files }) => {
    const fileSystem = mock<RpcFileSystem>();

    await expect(
      writeArtifactSet({ toolCallId: 'tc-7', targetFile: 'main.ts', format: 'gltf', files }, fileSystem),
    ).resolves.toBeUndefined();
    expect(fileSystem.writeBinaryFile).not.toHaveBeenCalled();
  });
});
