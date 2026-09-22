/**
 * Provenance on the agent's tool contract (blueprint R4, invariant I5).
 *
 * Every kernel-backed read carries the digests of the source it was computed
 * from, and every write carries the digest of what it wrote, so a stale answer
 * is self-diagnosing and the registry gate can compare the two.
 *
 * See `docs/research/agent-stale-kernel-result-elimination-blueprint.md`.
 */

import { describe, it, expect } from 'vitest';
import { createFileOutputSchema } from '#schemas/tools/create-file.tool.schema.js';
import { deleteFileOutputSchema } from '#schemas/tools/delete-file.tool.schema.js';
import { editFileOutputSchema } from '#schemas/tools/edit-file.tool.schema.js';
import { getKernelResultOutputSchema } from '#schemas/tools/get-kernel-result.tool.schema.js';
import { getParametersOutputSchema } from '#schemas/tools/parameter.tool.schema.js';
import { screenshotOutputSchema } from '#schemas/tools/screenshot.tool.schema.js';
import { testModelOutputSchema } from '#schemas/tools/test-model.tool.schema.js';

const digest = `sha256:${'a'.repeat(64)}` as const;
const nextDigest = `sha256:${'b'.repeat(64)}` as const;
const sourceRevision = { entry: 'main.ts', files: { 'main.ts': digest, 'lib/missing.ts': 'missing' } } as const;
const diffStats = { linesAdded: 1, linesRemoved: 0, originalContent: '', modifiedContent: 'x' };

describe('tool outputs carry the source revision they were computed from (R4)', () => {
  it('should preserve sourceRevision on a get_kernel_result output', () => {
    expect(getKernelResultOutputSchema.parse({ status: 'ready', sourceRevision })).toMatchObject({ sourceRevision });
  });

  it('should preserve sourceRevision on a screenshot output', () => {
    expect(
      screenshotOutputSchema.parse({ images: [{ view: 'isometric', dataUrl: 'data:,' }], sourceRevision }),
    ).toMatchObject({ sourceRevision });
  });

  it('should preserve one sourceRevision per model loaded by test_model', () => {
    expect(
      testModelOutputSchema.parse({ failures: [], passes: [], passed: 0, total: 0, sourceRevisions: [sourceRevision] }),
    ).toMatchObject({ sourceRevisions: [sourceRevision] });
  });

  it('should preserve sourceRevision on a get_parameters output', () => {
    expect(
      getParametersOutputSchema.parse({
        status: 'unresolved',
        diagnostics: [
          { code: 'SEMANTICS_UNRESOLVED', message: 'no', severity: 'error', resource: '', schemaPointer: '' },
        ],
        sourceRevision,
      }),
    ).toMatchObject({ sourceRevision });
  });

  it('should reject a digest that is not a lowercase sha256 content digest', () => {
    expect(() =>
      getKernelResultOutputSchema.parse({
        status: 'ready',
        sourceRevision: { entry: 'main.ts', files: { 'main.ts': 'sha256:NOPE' } },
      }),
    ).toThrow();
  });
});

describe('write outputs carry the revision they produced (R4)', () => {
  it('should preserve the written revision on an edit_file output', () => {
    expect(editFileOutputSchema.parse({ diffStats, revision: { path: 'main.ts', digest } })).toMatchObject({
      revision: { path: 'main.ts', digest },
    });
  });

  it('should preserve the written revision on a create_file output', () => {
    expect(
      createFileOutputSchema.parse({ diffStats, revision: { path: 'main.ts', digest: nextDigest } }),
    ).toMatchObject({ revision: { path: 'main.ts', digest: nextDigest } });
  });

  it('should record a deleted path as missing rather than a digest', () => {
    expect(
      deleteFileOutputSchema.parse({ message: 'gone', revision: { path: 'main.ts', digest: 'missing' } }),
    ).toMatchObject({ revision: { path: 'main.ts', digest: 'missing' } });
  });
});
