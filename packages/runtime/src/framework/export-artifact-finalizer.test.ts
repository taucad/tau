import { describe, expect, it } from 'vitest';
import type { ExportFile } from '@taucad/types';
import type { ExportGeometryResult } from '#types/runtime.types.js';
import { finalizeExportArtifactSet } from '#framework/export-artifact-finalizer.js';

const file = (name: string, value = 1): ExportFile => ({
  name,
  mimeType: 'application/octet-stream',
  bytes: new Uint8Array([value]),
});

const success = (data: ExportFile[]): Extract<ExportGeometryResult, { success: true }> => ({
  success: true,
  data,
  issues: [],
});

const missingMimeFile = file('model.gltf');
Reflect.set(missingMimeFile, 'mimeType', '');
const whitespaceMimeFile = file('model.gltf');
Reflect.set(whitespaceMimeFile, 'mimeType', '   ');
const invalidBytesFile = file('model.gltf');
Reflect.set(invalidBytesFile, 'bytes', [1, 2, 3]);

const invalidCases: Array<{ data: ExportFile[]; reason: string }> = [
  { data: [], reason: 'expected at least one file' },
  { data: [file('../model.gltf')], reason: 'unsafe relative path' },
  { data: [file('/model.gltf')], reason: 'unsafe relative path' },
  { data: [file(String.raw`buffers\model.bin`)], reason: 'unsafe relative path' },
  { data: [file('buffers//model.bin')], reason: 'unsafe relative path' },
  { data: [file('./model.gltf')], reason: 'unsafe relative path' },
  { data: [file('model\0.gltf')], reason: 'unsafe relative path' },
  { data: [file('model.gltf'), file('model.gltf')], reason: 'duplicates an earlier path' },
  { data: [invalidBytesFile], reason: 'has invalid bytes' },
  { data: [missingMimeFile], reason: 'has no MIME type' },
  { data: [whitespaceMimeFile], reason: 'has no MIME type' },
];

describe('finalizeExportArtifactSet', () => {
  it('should preserve a complete ordered set without copying files or bytes', () => {
    const files = [file('model.gltf'), file('textures/base color.png', 2)];
    const result = success(files);

    expect(finalizeExportArtifactSet(result)).toBe(result);
    expect(result.data[0]).toBe(files[0]);
    expect(result.data[1]?.bytes).toBe(files[1]?.bytes);
  });

  it.each(invalidCases)('should reject $reason', ({ data, reason }) => {
    const result = finalizeExportArtifactSet(success(data));

    expect(result.success).toBe(false);
    const issue = result.issues.at(-1);
    expect(issue?.code).toBe('EXPORT_ARTIFACT_SET_INVALID');
    expect(issue?.message).toContain(reason);
    expect(issue?.severity).toBe('error');
    expect(issue?.type).toBe('runtime');
  });

  it('should preserve an existing failure result', () => {
    const result: ExportGeometryResult = {
      success: false,
      issues: [{ code: 'RUNTIME', message: 'failed', severity: 'error', type: 'runtime' }],
    };

    expect(finalizeExportArtifactSet(result)).toBe(result);
  });
});
