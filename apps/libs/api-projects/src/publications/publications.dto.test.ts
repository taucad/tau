import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ProjectShareAccessInviteResponse as ProjectShareAccessInviteResponseWire,
  ProjectShareEnvelope as ProjectShareEnvelopeWire,
  ProjectShare as ProjectShareWire,
  PublishResponseBody,
} from '@taucad/types';
import type {
  ProjectShare,
  ProjectShareAccessInviteResponse,
  ProjectShareEnvelope,
  PublicationWireRow,
  PublishResponse,
} from '#publications/publications.dto.js';
import {
  publicationOwnerSnapshotSchema,
  publicationRowSchema,
  publicationUrlsSchema,
  publicationViewResponseSchema,
  projectShareAccessInviteResponseSchema,
  projectShareEnvelopeSchema,
  inviteProjectShareAccessSchema,
  publishResponseSchema,
  publishRequestSchema,
  storedPublicationManifestSchema,
  updateProjectShareSchema,
} from '#publications/publications.dto.js';

describe('publishRequestSchema', () => {
  const valid = {
    projectId: 'proj',
    projectName: 'Demo',
    tag: 'v1',
    revisionId: 'a'.repeat(40),
    entryPath: 'main.ts',
    visibility: 'private',
  };

  it('parses a pointer into the graph', () => {
    const result = publishRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tag).toBe('v1');
      expect(result.data.revisionId).toBe('a'.repeat(40));
    }
  });

  it.each(['Ready for print', 'v0', 'V3', 'v3.1', 'refs/tags/v3'])(
    'rejects %j: a version is published by its tag, v<number> (B6)',
    (tag) => {
      expect(publishRequestSchema.safeParse({ ...valid, tag }).success).toBe(false);
    },
  );

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

  it('accepts a request without visibility, which keeps the link setting', () => {
    const { visibility: _visibility, ...withoutVisibility } = valid;
    expect(publishRequestSchema.safeParse(withoutVisibility).success).toBe(true);
  });

  it('keeps the default a new link takes, and refuses a bad one', () => {
    const { visibility: _visibility, ...withoutVisibility } = valid;
    const result = publishRequestSchema.safeParse({ ...withoutVisibility, defaultVisibility: 'public' });
    expect(result.success && result.data.defaultVisibility).toBe('public');
    expect(publishRequestSchema.safeParse({ ...valid, defaultVisibility: 'secret' }).success).toBe(false);
  });

  it('strips the title and invite fields a publish no longer takes', () => {
    const result = publishRequestSchema.safeParse({
      ...valid,
      title: 'Old title',
      sharedEmails: ['friend@example.com'],
      notifyRecipients: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('title');
      expect(result.data).not.toHaveProperty('sharedEmails');
      expect(result.data).not.toHaveProperty('notifyRecipients');
    }
  });
});

describe('inviteProjectShareAccessSchema', () => {
  it('normalizes email before validation and preserves notifyRecipient', () => {
    const result = inviteProjectShareAccessSchema.safeParse({
      email: ' Friend@Example.com ',
      notifyRecipient: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ email: 'friend@example.com', notifyRecipient: true });
    }
  });
});

describe('updateProjectShareSchema', () => {
  it('accepts private and public visibility values', () => {
    expect(updateProjectShareSchema.safeParse({ visibility: 'private' }).success).toBe(true);
    expect(updateProjectShareSchema.safeParse({ visibility: 'public' }).success).toBe(true);
  });

  it('rejects unsupported visibility values', () => {
    expect(updateProjectShareSchema.safeParse({ visibility: 'secret' }).success).toBe(false);
  });
});

describe('projectShareAccessInviteResponseSchema', () => {
  const grant = {
    id: 'sga_1',
    recipientEmail: 'friend@example.com',
    status: 'active',
    createdAt: '2026-01-03T00:00:00.000Z',
    revokedAt: null,
  };

  it.each([
    { status: 'sent' },
    { status: 'not_requested' },
    { status: 'skipped', reason: 'daily_cap' },
    { status: 'skipped', reason: 'limiter_unavailable' },
    { status: 'skipped', reason: 'email_disabled' },
    { status: 'skipped', reason: 'undeliverable' },
    { status: 'skipped', reason: 'send_failed' },
  ])('accepts the email outcome %o', (email) => {
    expect(projectShareAccessInviteResponseSchema.safeParse({ ...grant, email }).success).toBe(true);
  });

  it('rejects a skipped email without a known reason', () => {
    expect(
      projectShareAccessInviteResponseSchema.safeParse({ ...grant, email: { status: 'skipped', reason: 'other' } })
        .success,
    ).toBe(false);
    expect(projectShareAccessInviteResponseSchema.safeParse({ ...grant, email: { status: 'skipped' } }).success).toBe(
      false,
    );
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
        view: 'https://app.example/s/tau~shr_1',
        share: 'https://app.example/s/tau~shr_1',
        og: 'https://cdn.example/og.png',
        thumbnail: 'https://cdn.example/t.webp',
        manifest: 'https://cdn.example/m.json',
      },
      share: { id: 'shr_1', url: 'https://app.example/s/tau~shr_1', visibility: 'private' },
      version: { tag: 'v1' },
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
  it('parses a project that has no link yet', () => {
    const result = projectShareEnvelopeSchema.safeParse({
      project: { id: 'proj_share', name: null, description: null },
      share: null,
    });

    expect(result.success).toBe(true);
  });

  it('parses a stopped link with its version and invited people', () => {
    const result = projectShareEnvelopeSchema.safeParse({
      project: { id: 'proj_share', name: 'Tray', description: 'Shared source' },
      share: {
        id: 'shr_1',
        url: 'https://app.example/s/tau~shr_1',
        visibility: 'private',
        status: 'stopped',
        stoppedAt: '2026-01-04T00:00:00.000Z',
        publishedAt: '2026-01-02T00:00:00.000Z',
        currentVersion: { publicationId: 'pub_share', tag: 'v4', revisionId: 'a'.repeat(40) },
        access: {
          grants: [
            {
              id: 'sga_1',
              recipientEmail: 'friend@example.com',
              status: 'active',
              createdAt: '2026-01-03T00:00:00.000Z',
              revokedAt: null,
              notDelivered: false,
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown link status', () => {
    const result = projectShareEnvelopeSchema.safeParse({
      project: { id: 'proj_share', name: 'Tray', description: null },
      share: {
        id: 'shr_1',
        url: 'https://app.example/s/tau~shr_1',
        visibility: 'private',
        status: 'paused',
        stoppedAt: null,
        publishedAt: null,
        currentVersion: null,
        access: { grants: [] },
      },
    });

    expect(result.success).toBe(false);
  });
});

/* The UI imports these shapes from `@taucad/types`; they are the schemas' own, so neither side can drift. */
describe('cloud link wire types in @taucad/types', () => {
  it('match the schemas the API serializes with', () => {
    expectTypeOf<ProjectShareEnvelope>().toExtend<ProjectShareEnvelopeWire>();
    expectTypeOf<ProjectShareEnvelopeWire>().toExtend<ProjectShareEnvelope>();
    expectTypeOf<ProjectShare>().toExtend<ProjectShareWire>();
    expectTypeOf<ProjectShareWire>().toExtend<ProjectShare>();
    expectTypeOf<ProjectShareAccessInviteResponse>().toExtend<ProjectShareAccessInviteResponseWire>();
    expectTypeOf<ProjectShareAccessInviteResponseWire>().toExtend<ProjectShareAccessInviteResponse>();
    expectTypeOf<PublishResponse>().toExtend<PublishResponseBody>();
    expectTypeOf<PublishResponseBody>().toExtend<PublishResponse>();
  });
});
