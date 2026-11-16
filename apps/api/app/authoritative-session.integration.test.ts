/**
 * Blueprint WP4 case 7: the three GET routes that mint something outliving the request read the session store
 * even when a fresh snapshot is presented. The real controllers run behind the real guard and resolver over a
 * real Better Auth instance (harness H1); their services are stubs, which must never run for a deleted session.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { ConfigService } from '@nestjs/config';
import { HostsService } from '@taucad/api-hosts';
import { ObjectStorageService } from '@taucad/api-object-storage';
import { PublicationRateLimiterService } from '@taucad/api-redis';
import { repositoryStoreKey } from '@taucad/api-git-core/git.constants';
import { createSessionCacheHarness } from '@taucad/api-auth/testing/session-cache';
import type { CookieJar, SessionCacheHarness } from '@taucad/api-auth/testing/session-cache';
import { GitCatalogueController } from '#api/git/catalogue.controller.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { RevisionSaltController } from '#api/git/revision-salt.controller.js';
import { JobsController } from '#api/jobs/jobs.controller.js';
import { JobsService } from '#api/jobs/jobs.service.js';

describe('authoritative GET routes with the session cookie cache', () => {
  const jobs = mockDeep<JobsService>();
  const objectStorage = mockDeep<ObjectStorageService>();
  const rateLimiter = mockDeep<PublicationRateLimiterService>();
  const config = mockDeep<ConfigService>();
  config.get.mockReturnValue('revision-salt-test-secret');
  let h: SessionCacheHarness;

  beforeAll(async () => {
    h = await createSessionCacheHarness({
      controllers: [JobsController, GitCatalogueController, RevisionSaltController],
      providers: [
        { provide: JobsService, useValue: jobs },
        { provide: HostsService, useValue: mockDeep<HostsService>() },
        { provide: ObjectStorageService, useValue: objectStorage },
        { provide: GitRepositoryService, useValue: mockDeep<GitRepositoryService>() },
        { provide: PublicationRateLimiterService, useValue: rateLimiter },
        { provide: repositoryStoreKey, useValue: {} },
        { provide: ConfigService, useValue: config },
      ],
    });
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(() => {
    jobs.getArtifact.mockReset();
    jobs.getArtifact.mockResolvedValue({
      digest: 'd',
      mediaType: 'application/octet-stream',
      size: 1,
      storageKey: 'k',
    });
    objectStorage.presignGet.mockReset();
    objectStorage.presignGet.mockResolvedValue('https://storage.example.test/signed');
    rateLimiter.consumeWindowBudget.mockReset();
    // Refused at the rate limit, so the positive control stops before the repository stubs.
    rateLimiter.consumeWindowBudget.mockResolvedValue({ allowed: false, count: 61, retryAfterSeconds: 1 });
  });

  const routes = [
    {
      name: 'jobs artifact',
      url: '/v1/jobs/job_1/artifacts/artifact_1',
      control: 200,
      stubCalled: (): boolean =>
        jobs.getArtifact.mock.calls.length > 0 || objectStorage.presignGet.mock.calls.length > 0,
    },
    {
      name: 'git catalogue',
      url: '/v1/projects/project_1/git/catalogue?refs=heads',
      control: 429,
      stubCalled: (): boolean => rateLimiter.consumeWindowBudget.mock.calls.length > 0,
    },
    {
      name: 'revision salt',
      url: '/v1/revisions/salt?workspace=w',
      control: 200,
      stubCalled: undefined,
    },
  ] as const;

  const signedIn = async (): Promise<{ jar: CookieJar; userId: string }> => {
    const { jar, userId } = await h.signUp();
    return { jar, userId };
  };

  it.each(routes)('should run $name while the session row exists (positive control)', async (route) => {
    const { jar } = await signedIn();
    h.resetReads();
    const response = await h.inject({ url: route.url, jar });
    expect(response.statusCode).toBe(route.control);
    expect(h.sessionReads()).toBe(1);
    if (route.stubCalled === undefined) {
      expect(response.json<{ salt: string }>().salt).toMatch(/^[\da-f]{64}$/u);
    } else {
      expect(route.stubCalled()).toBe(true);
    }
  });

  it.each(routes)('should refuse $name within 60 s of a row delete and never reach the stub', async (route) => {
    const { jar, userId } = await signedIn();
    h.deleteSessions(userId);
    const response = await h.inject({ url: route.url, jar });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('salt');
    expect(route.stubCalled?.() ?? false).toBe(false);
  });
});
