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
  publishUploadSchema,
  storedPublicationManifestSchema,
  updatePublicationVisibilitySchema,
} from '#api/publications/publications.dto.js';

describe('publishUploadSchema', () => {
  const emptyFiles = new Map<string, Uint8Array<ArrayBuffer>>();
  const validManifestJson = JSON.stringify({
    projectId: 'proj',
    projectName: 'Demo',
    entryFile: 'main.ts',
    visibility: 'private',
    title: 'T',
  });

  it('rejects missing manifest field', () => {
    const result = publishUploadSchema.safeParse({ files: emptyFiles });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('expected parse failure');
    }

    expect(result.error.issues.some((issue) => issue.path.includes('manifest'))).toBe(true);
    expect(result.error.issues.some((issue) => issue.message.includes('Missing multipart field manifest'))).toBe(true);
  });

  it('rejects non-JSON manifest string', () => {
    const result = publishUploadSchema.safeParse({ manifest: '{', files: emptyFiles });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('expected parse failure');
    }

    expect(result.error.issues.some((issue) => issue.message.includes('Manifest is not valid JSON'))).toBe(true);
  });

  it('rejects manifest missing entryFile', () => {
    const manifestJson = JSON.stringify({
      projectId: 'proj',
      projectName: 'Demo',
      visibility: 'private',
      title: 'T',
    });
    const result = publishUploadSchema.safeParse({ manifest: manifestJson, files: emptyFiles });
    expect(result.success).toBe(false);
  });

  it('rejects bad visibility literal', () => {
    const manifestJson = JSON.stringify({
      projectId: 'proj',
      projectName: 'Demo',
      entryFile: 'main.ts',
      visibility: 'secret',
      title: 'T',
    });
    const result = publishUploadSchema.safeParse({ manifest: manifestJson, files: emptyFiles });
    expect(result.success).toBe(false);
  });

  it('rejects empty title', () => {
    const manifestJson = JSON.stringify({
      projectId: 'proj',
      projectName: 'Demo',
      entryFile: 'main.ts',
      visibility: 'private',
      title: '',
    });
    const result = publishUploadSchema.safeParse({ manifest: manifestJson, files: emptyFiles });
    expect(result.success).toBe(false);
  });

  it('parses valid multipart-shaped payload', () => {
    const files = new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', new Uint8Array([47])]]);
    const result = publishUploadSchema.safeParse({ manifest: validManifestJson, files });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.manifest.entryFile).toBe('main.ts');
      expect(result.data.files.get('main.ts')).toBeDefined();
    }
  });

  it('normalizes and deduplicates shared emails for private manifests', () => {
    const manifestJson = JSON.stringify({
      projectId: 'proj',
      projectName: 'Demo',
      entryFile: 'main.ts',
      visibility: 'private',
      title: 'T',
      sharedEmails: [' Friend@Example.com ', 'friend@example.com', 'TEAM@example.com'],
    });

    const result = publishUploadSchema.safeParse({ manifest: manifestJson, files: emptyFiles });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.manifest.sharedEmails).toEqual(['friend@example.com', 'team@example.com']);
    }
  });

  it('rejects shared emails for public manifests', () => {
    const manifestJson = JSON.stringify({
      projectId: 'proj',
      projectName: 'Demo',
      entryFile: 'main.ts',
      visibility: 'public',
      title: 'T',
      sharedEmails: ['friend@example.com'],
    });

    const result = publishUploadSchema.safeParse({ manifest: manifestJson, files: emptyFiles });
    expect(result.success).toBe(false);
  });

  it('rejects more than 50 shared emails', () => {
    const manifestJson = JSON.stringify({
      projectId: 'proj',
      projectName: 'Demo',
      entryFile: 'main.ts',
      visibility: 'private',
      title: 'T',
      sharedEmails: Array.from({ length: 51 }, (_, index) => `friend${index.toString()}@example.com`),
    });

    const result = publishUploadSchema.safeParse({ manifest: manifestJson, files: emptyFiles });
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
    ownerId: 'user_1',
    parentPublicationId: null,
    visibility: 'public',
    manifestKey: 'm.json',
    ogImageKey: null,
    thumbnailKey: null,
    runtimePin: '~1',
    kernels: ['replicad'],
    entryFile: 'main.ts',
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
        ogImageKey: 'og.png',
        thumbnailKey: 't.webp',
        description: 'hello',
      }).success,
    ).toBe(true);
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
      view: 'https://app.example/v/1',
      share: 'https://app.example/v/1',
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
        view: 'https://app.example/v/pub',
        share: 'https://app.example/v/pub',
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
    entryFile: entryRelativePath,
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
        ownerId: 'u',
        parentPublicationId: null,
        visibility: 'public',
        manifestKey: 'm.json',
        ogImageKey: null,
        thumbnailKey: null,
        runtimePin: 'x',
        kernels: [],
        entryFile: entryRelativePath,
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
        view: 'https://app.example/v/pub',
        share: 'https://app.example/v/pub',
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
        urls: { share: 'https://app.example/v/pub_share' },
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
