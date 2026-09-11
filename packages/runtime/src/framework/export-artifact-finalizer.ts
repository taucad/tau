import type { ExportGeometryResult, KernelIssue } from '#types/runtime.types.js';
import { validateArtifactPaths } from '#types/export-artifact-validation.js';

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

  const issues: KernelIssue[] = [];
  for (const issue of validateArtifactPaths(result.data)) {
    issues.push(
      invalidArtifactSetIssue(
        issue.reason === 'duplicate-path'
          ? `file ${issue.index} duplicates an earlier path`
          : `file ${issue.index} has an unsafe relative path`,
        { index: issue.index, name: issue.name },
      ),
    );
  }
  for (const [index, file] of result.data.entries()) {
    if (!(file.bytes instanceof Uint8Array)) {
      issues.push(invalidArtifactSetIssue(`file ${index} has invalid bytes`, { index, name: file.name }));
    }
    if (typeof file.mimeType !== 'string' || file.mimeType.trim().length === 0) {
      issues.push(invalidArtifactSetIssue(`file ${index} has no MIME type`, { index, name: file.name }));
    }
  }
  if (issues.length > 0) {
    return { success: false, issues: [...result.issues, ...issues] };
  }

  return result;
};
