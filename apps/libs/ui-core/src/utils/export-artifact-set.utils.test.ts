import { describe, expect, it, vi } from 'vitest';
import type { ExportFile } from '@taucad/types';
import type * as FileUtilsModule from '@taucad/utils/file';
import JSZip from 'jszip';
import { createExportArtifactZip, downloadExportArtifactSet } from '#utils/export-artifact-set.utils.js';

const { downloadBlob } = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('@taucad/utils/file', async (importOriginal) => ({
  ...(await importOriginal<typeof FileUtilsModule>()),
  downloadBlob,
}));

const file = (name: string, value: number): ExportFile => ({
  name,
  mimeType: 'application/octet-stream',
  bytes: new Uint8Array([value]),
});

describe('export artifact set downloads', () => {
  it('should download one artifact directly with the consumer-friendly name', async () => {
    await downloadExportArtifactSet([file('model.step', 1)], {
      singleFileName: 'project.step',
      archiveName: 'project-step.zip',
    });

    expect(downloadBlob).toHaveBeenCalledOnce();
    expect(downloadBlob.mock.calls[0]?.[1]).toBe('project.step');
  });

  it('should preserve producer paths and format namespaces in a ZIP', async () => {
    const blob = await createExportArtifactZip([
      { directory: 'gltf', files: [file('model.gltf', 1), file('buffers/model.bin', 2)] },
      { directory: 'obj', files: [file('model.obj', 3), file('model.mtl', 4)] },
    ]);
    const zip = await JSZip.loadAsync(blob);

    expect(Object.keys(zip.files).sort()).toEqual([
      'gltf/',
      'gltf/buffers/',
      'gltf/buffers/model.bin',
      'gltf/model.gltf',
      'obj/',
      'obj/model.mtl',
      'obj/model.obj',
    ]);
    await expect(zip.file('gltf/buffers/model.bin')!.async('uint8array')).resolves.toEqual(new Uint8Array([2]));
  });

  it.each(['../model.bin', '/model.bin', String.raw`buffers\model.bin`])(
    'should reject unsafe path %s',
    async (name) => {
      await expect(createExportArtifactZip([{ files: [file(name, 1)] }])).rejects.toThrow(
        `Export artifact has an unsafe relative path: ${name}`,
      );
    },
  );
});
