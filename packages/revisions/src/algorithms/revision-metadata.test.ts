import { describe, expect, it } from 'vitest';
import { revisionMetadataSchema } from '#algorithms/revision-metadata.js';
import { recordedBy } from '#test/identity.js';

describe('revisionMetadataSchema', () => {
  it('rejects an unknown sixth provenance source', () => {
    const result = revisionMetadataSchema.safeParse({
      version: 1,
      id: 'a-revision',
      parents: [],
      provenance: { source: 'automation', ...recordedBy('test'), createdAt: 0 },
      summary: { generated: 'test' },
    });

    expect(result.success).toBe(false);
  });

  it('requires the one identifier every persistence format now writes', () => {
    const result = revisionMetadataSchema.safeParse({
      version: 1,
      revisionId: 'native-git-revision',
      parents: [],
      provenance: { source: 'agent', ...recordedBy('test'), createdAt: 0 },
      summary: { generated: 'test' },
    });

    expect(result.success).toBe(false);
  });
});
