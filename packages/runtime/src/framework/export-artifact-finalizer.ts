import { isSafeRelativePath } from '@taucad/utils/path';
import type { ExportGeometryResult, KernelIssue } from '#types/runtime.types.js';

const invalidArtifactSetIssue = (reason: string, details: unknown): KernelIssue => ({
  message: `Export produced an invalid artifact set: ${reason}`,
  code: 'EXPORT_ARTIFACT_SET_INVALID',
  type: 'runtime',
  severity: 'error',
  details,
});

/**
 * Validate a complete export result without copying or reordering its files.
 *
 * @param result - Export result returned by a kernel or transcoder.
 * @returns The original valid result or a structured artifact-set failure.
 */
export const finalizeExportArtifactSet = (result: ExportGeometryResult): ExportGeometryResult => {
  if (!result.success) {
    return result;
  }
  if (result.data.length === 0) {
    return {
      success: false,
      issues: [...result.issues, invalidArtifactSetIssue('expected at least one file', { actualCount: 0 })],
    };
  }

  const names = new Set<string>();
  for (const [index, file] of result.data.entries()) {
    if (!isSafeRelativePath(file.name)) {
      return {
        success: false,
        issues: [
          ...result.issues,
          invalidArtifactSetIssue(`file ${index} has an unsafe relative path`, { index, name: file.name }),
        ],
      };
    }
    if (names.has(file.name)) {
      return {
        success: false,
        issues: [
          ...result.issues,
          invalidArtifactSetIssue(`file ${index} duplicates an earlier path`, { index, name: file.name }),
        ],
      };
    }
    if (!(file.bytes instanceof Uint8Array)) {
      return {
        success: false,
        issues: [
          ...result.issues,
          invalidArtifactSetIssue(`file ${index} has invalid bytes`, { index, name: file.name }),
        ],
      };
    }
    if (typeof file.mimeType !== 'string' || file.mimeType.trim().length === 0) {
      return {
        success: false,
        issues: [
          ...result.issues,
          invalidArtifactSetIssue(`file ${index} has no MIME type`, { index, name: file.name }),
        ],
      };
    }
    names.add(file.name);
  }

  return result;
};
