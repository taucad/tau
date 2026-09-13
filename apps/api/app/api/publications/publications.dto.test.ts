import { describe, expect, it } from 'vitest';
import type { PublicationWireRow } from '#api/publications/publications.dto.js';
import {
  publicationOwnerSnapshotSchema,
  publicationRowSchema,
  publicationUrlsSchema,
  publicationViewResponseSchema,
  projectShareEnvelopeSchema,
  invitePublicationAccessSchema,
  publicationVisibilityUpdateSchema,
  publishResponseSchema,
  publishRequestSchema,
  storedPublicationManifestSchema,
  updatePublicationVisibilitySchema,
} from '#api/publications/publications.dto.js';

describe('publishRequestSchema', () => {
  const valid = {
    projectId: 'proj',
    projectName: 'Demo',
    tag: 'v1',
    revisionId: 'a'.repeat(40),
    entryPath: 'main.ts',
    visibility: 'private',
    title: 'T',
  };

  it('parses a pointer into the graph', () => {
    const result = publishRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tag).toBe('v1');
      expect(result.data.revisionId).toBe('a'.repeat(40));
    }
  });

  it('rejects a request with no named version', () => {
    const { tag: _tag, ...withoutTag } = valid;
    const result = publishRequestSchema.safeParse(withoutTag);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('tag'))).toBe(true);
    }
  });

  it('rejects a request with no revision', () => {
    const { revisionId: _revisionId, ...withoutRevision } = valid;
    expect(publishRequestSchema.safeParse(withoutRevision).success).toBe(false);
  });

  it('rejects a request missing entryPath', () => {
    const { entryPath: _entryPath, ...withoutEntry } = valid;
    expect(publishRequestSchema.safeParse(withoutEntry).success).toBe(false);
  });

  it('rejects a bad visibility literal', () => {
    expect(publishRequestSchema.safeParse({ ...valid, visibility: 'secret' }).success).toBe(false);
  });

  it('rejects an empty title', () => {
    expect(publishRequestSchema.safeParse({ ...valid, title: '' }).success).toBe(false);
  });

  it('normalizes and deduplicates shared emails for private publications', () => {
    const result = publishRequestSchema.safeParse({
      ...valid,
      sharedEmails: [' Friend@Example.com ', 'friend@example.com', 'TEAM@example.com'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sharedEmails).toEqual(['friend@example.com', 'team@example.com']);
    }
  });

  it('rejects shared emails on a public publication', () => {
    const result = publishRequestSchema.safeParse({
      ...valid,
      visibility: 'public',
      sharedEmails: ['friend@example.com'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 50 shared emails', () => {
    const result = publishRequestSchema.safeParse({
      ...valid,
      sharedEmails: Array.from({ length: 51 }, (_, index) => `friend${index.toString()}@example.com`),
    });
    expect(result.success).toBe(false);
  });
});

describe('invitePublicationAccessSchema', () => {
  it('normalizes email before validation and preserves notifyRecipient', () => {
    const result = invitePublicationAccessSchema.safeParse({
      email: ' Friend@Example.com ',
      notifyRecipient: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ email: 'friend@example.com', notifyRecipient: true });
    }
  });
});

describe('updatePublicationVisibilitySchema', () => {
  it('accepts private and public visibility values', () => {
    expect(updatePublicationVisibilitySchema.safeParse({ visibility: 'private' }).success).toBe(true);
    expect(updatePublicationVisibilitySchema.safeParse({ visibility: 'public' }).success).toBe(true);
  });

  it('rejects unsupported visibility values', () => {
    expect(updatePublicationVisibilitySchema.safeParse({ visibility: 'secret' }).success).toBe(false);
  });
});

describe('publicationVisibilityUpdateSchema', () => {
  it('serializes the visibility update response shape', () => {
    expect(publicationVisibilityUpdateSchema.safeParse({ id: 'pub_1', visibility: 'public' }).success).toBe(true);
  });
});

describe('publicationOwnerSnapshotSchema', () => {
  it('accepts nullable image', () => {
    expect(
      publicationOwnerSnapshotSchema.safeParse({
        id: 'user_1',
        name: 'Ada',
        image: null,
      }).success,
    ).toBe(true);
  });

  it('rejects missing name', () => {
    expect(
      publicationOwnerSnapshotSchema.safeParse({
        id: 'user_1',
        image: null,
      }).success,
    ).toBe(false);
  });
});

describe('publicationRowSchema', () => {
  const baseRow: PublicationWireRow = {
    id: 'pub_1',
    projectId: 'proj',
    tag: 'v1',
    revisionId: 'a'.repeat(40),
    ownerId: 'user_1',
    parentPublicationId: null,
    visibility: 'public',
    runtimePin: '~1',
    kernels: ['replicad'],
    entryPath: 'main.ts',
    title: 'T',
    description: null,
    forkCount: 0,
    viewCount: 0,
    ownerSnapshot: null,
    createdAt: '2020-01-01T00:00:00.000Z',
    unpublishedAt: null,
  };

  it('accepts nullables populated and all-null where allowed', () => {
    expect(publicationRowSchema.safeParse(baseRow).success).toBe(true);
    expect(
      publicationRowSchema.safeParse({
        ...baseRow,
        parentPublicationId: 'parent_pub',
        description: 'hello',
      }).success,
    ).toBe(true);
  });

  it('should strip internal storage keys from the wire row (no raw-layout disclosure)', () => {
    const parsed = publicationRowSchema.safeParse({
      ...baseRow,
      manifestKey: 'publications/pub_1/manifest.json',
      ogImageKey: 'defaults/og.png',
      thumbnailKey: 'defaults/thumb.webp',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('manifestKey');
      expect(parsed.data).not.toHaveProperty('ogImageKey');
      expect(parsed.data).not.toHaveProperty('thumbnailKey');
    }
  });

  it('accepts populated ownerSnapshot', () => {
    expect(
      publicationRowSchema.safeParse({
        ...baseRow,
        ownerSnapshot: { id: 'user_1', name: 'Ada', image: 'https://cdn.example/a.png' },
      }).success,
    ).toBe(true);
  });

  it('accepts undefined ownerSnapshot', () => {
    expect(publicationRowSchema.safeParse({ ...baseRow, ownerSnapshot: undefined }).success).toBe(true);
  });

  it('rejects malformed ownerSnapshot', () => {
    expect(
      publicationRowSchema.safeParse({
        ...baseRow,
        ownerSnapshot: { id: 'user_1', name: 123, image: null },
      }).success,
    ).toBe(false);
  });

  it('rejects non-ISO createdAt', () => {
    expect(publicationRowSchema.safeParse({ ...baseRow, createdAt: 'not-a-date' }).success).toBe(false);
  });

  it('rejects negative forkCount', () => {
    expect(publicationRowSchema.safeParse({ ...baseRow, forkCount: -1 }).success).toBe(false);
  });
});

describe('publicationUrlsSchema', () => {
  it('rejects non-URL strings', () => {
    expect(
      publicationUrlsSchema.safeParse({
        view: 'not a url',
        share: 'https://x',
        og: 'https://x',
        thumbnail: 'https://x',
        manifest: 'https://x',
      }).success,
    ).toBe(false);
  });

  it('accepts URL fields', () => {
    const urls = {
      view: 'https://app.example/s/1',
      share: 'https://app.example/s/1',
      og: 'https://cdn.example/og.png',
      thumbnail: 'https://cdn.example/t.webp',
      manifest: 'https://cdn.example/m.json',
    };
    expect(publicationUrlsSchema.safeParse(urls).success).toBe(true);
  });
});

describe('publishResponseSchema', () => {
  it('round-trips and rejects unknown keys in strict mode', () => {
    const payload = {
      id: 'pub',
      urls: {
        view: 'https://app.example/s/tau~pub',
        share: 'https://app.example/s/tau~pub',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/t.webp',
        manifest: 'https://cdn.example/m.json',
      },
      extra: 'strip',
    };
    expect(publishResponseSchema.strict().safeParse(payload).success).toBe(false);
    expect(publishResponseSchema.safeParse(payload).success).toBe(true);
  });
});

describe('publicationViewResponseSchema', () => {
  const entryRelativePath = 'main.ts';
  const manifest = storedPublicationManifestSchema.parse({
    version: 1,
    projectId: 'proj',
    entryPath: entryRelativePath,
    files: { [entryRelativePath]: 'sha256:' + 'a'.repeat(64) },
    kernels: [],
    runtime: '@taucad/runtime@x',
    parameters: {},
    createdAt: '2020-01-01T00:00:00.000Z',
  });

  it('round-trips and rejects unknown keys in strict mode', () => {
    const payload = {
      publication: {
        id: 'pub',
        projectId: 'proj',
        tag: 'v1',
        revisionId: 'a'.repeat(40),
        ownerId: 'u',
        parentPublicationId: null,
        visibility: 'public',
        manifestKey: 'm.json',
        ogImageKey: null,
        thumbnailKey: null,
        runtimePin: 'x',
        kernels: [],
        entryPath: entryRelativePath,
        title: 'T',
        description: null,
        forkCount: 0,
        viewCount: 0,
        ownerSnapshot: null,
        createdAt: '2020-01-01T00:00:00.000Z',
        unpublishedAt: null,
      },
      viewerRole: 'public',
      urls: {
        view: 'https://app.example/s/tau~pub',
        share: 'https://app.example/s/tau~pub',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/t.webp',
        manifest: 'https://cdn.example/m.json',
      },
      manifest,
      files: { [entryRelativePath]: 'https://blobs.example/o' },
      leak: true,
    };
    expect(publicationViewResponseSchema.strict().safeParse(payload).success).toBe(false);
    expect(publicationViewResponseSchema.safeParse(payload).success).toBe(true);
  });
});

describe('projectShareEnvelopeSchema', () => {
  it('parses unpublished project envelopes', () => {
    const result = projectShareEnvelopeSchema.safeParse({
      project: { id: 'proj_share', name: null, description: null },
      currentPublication: null,
      snapshot: { state: 'unpublished' },
    });

    expect(result.success).toBe(true);
  });

  it('parses current publication envelopes with active grants', () => {
    const result = projectShareEnvelopeSchema.safeParse({
      project: { id: 'proj_share', name: 'Tray', description: 'Shared source' },
      currentPublication: {
        id: 'pub_share',
        title: 'Tray',
        description: null,
        visibility: 'private',
        createdAt: '2026-01-02T00:00:00.000Z',
        urls: { share: 'https://app.example/s/tau~pub_share' },
        access: {
          grants: [
            {
              id: 'pva_1',
              publicationId: 'pub_share',
              recipientEmail: 'friend@example.com',
              status: 'active',
              createdAt: '2026-01-03T00:00:00.000Z',
              revokedAt: null,
            },
          ],
        },
      },
      snapshot: { state: 'published-current', lastPublishedAt: '2026-01-02T00:00:00.000Z' },
    });

    expect(result.success).toBe(true);
  });
});
