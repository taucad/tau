import { describe, expect, it } from 'vitest';
import { revisionMetadataSchema } from '#revision-metadata.js';

describe('revisionMetadataSchema', () => {
  it('rejects an unknown sixth provenance source identically for both persistence formats', () => {
    const metadata = {
      version: 1,
      parents: [],
      provenance: { source: 'automation', actorId: 'test', createdAt: 0 },
      summary: { generated: 'test' },
    };
    const results = [
      revisionMetadataSchema.safeParse({ ...metadata, id: 'browser-revision' }),
      revisionMetadataSchema.safeParse({ ...metadata, revisionId: 'native-git-revision' }),
    ];
    const issues = results.map((result) =>
      result.success ? [] : result.error.issues.map(({ code, message, path }) => ({ code, message, path })),
    );

    expect(results.map(({ success }) => success)).toEqual([false, false]);
    expect(issues[0]).toEqual(issues[1]);
  });
});
