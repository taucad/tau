import { Readable } from 'node:stream';

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { HostsService } from '#api/hosts/hosts.service.js';
import { JobsController } from '#api/jobs/jobs.controller.js';
import type { JobsService } from '#api/jobs/jobs.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';

const device = { id: 'device-authenticated', ownerId: 'owner-1' };

const harness = () => {
  const jobs = {
    isRunnerAuthorized: vi.fn(async () => true),
    isArtifactAttemptAuthorized: vi.fn(async () => true),
    reportProgress: vi.fn(async () => ({ accepted: true })),
    registerRunner: vi.fn(async () => ({ accepted: true })),
  };
  const hosts = { authenticateDevice: vi.fn(async () => device) };
  const storage = {};
  const controller = new JobsController(
    jobs as unknown as JobsService,
    hosts as unknown as HostsService,
    storage as ObjectStorageService,
  );
  return { controller, jobs };
};

describe('JobsController paired-runner authorization', () => {
  it('overwrites a spoofed runner identity with the authenticated paired device', async () => {
    const { controller, jobs } = harness();
    const body = {
      attemptId: 'attempt-1',
      attempt: 1,
      runnerId: 'attacker-controlled',
      progress: { phase: 'solve', completed: 1, total: 2, message: 'running' },
    };

    await expect(controller.reportProgress('job-1', body, 'Bearer credential')).resolves.toEqual({ accepted: true });
    expect(jobs.reportProgress).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      runnerId: 'device-authenticated',
      jobId: 'job-1',
      attemptId: 'attempt-1',
      attempt: 1,
      progress: body.progress,
    });
  });

  it('derives runner registration identity and rejects artifacts outside its active attempt', async () => {
    const { controller, jobs } = harness();
    await controller.registerRunner({ capabilities: { os: 'linux' }, slots: 2 }, 'Bearer credential');
    expect(jobs.registerRunner).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      runnerId: 'device-authenticated',
      capabilities: { os: 'linux' },
      slots: 2,
    });

    jobs.isArtifactAttemptAuthorized.mockResolvedValueOnce(false);
    await expect(
      controller.createWorkerArtifactUpload(
        {
          jobId: 'job-1',
          attemptId: 'attempt-other',
          attempt: 1,
          digest: `sha256:${'0'.repeat(64)}`,
          size: 1,
          mediaType: 'text/plain',
        },
        'Bearer credential',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('publishes an action only after its exact output content exists under owner authority', async () => {
    const actionDigest = `sha256:${'a'.repeat(64)}` as const;
    const outputDigest = `sha256:${'b'.repeat(64)}` as const;
    const record = {
      schemaVersion: 1,
      actionDigest,
      codec: { id: 'openfoam-stage', version: '1' },
      output: { digest: outputDigest, size: 42, mediaType: 'application/octet-stream' },
      dependencies: [],
    } as const;
    const jobs = {
      isRunnerAuthorized: vi.fn(async () => true),
      isArtifactAttemptAuthorized: vi.fn(async () => true),
    };
    const hosts = { authenticateDevice: vi.fn(async () => device) };
    const storage = {
      headBlob: vi.fn(async () => ({ contentType: 'application/octet-stream', size: 42, etag: 'content' })),
      putBlob: vi.fn(async () => ({ etag: 'action', alreadyExisted: false })),
    };
    const controller = new JobsController(
      jobs as unknown as JobsService,
      hosts as unknown as HostsService,
      storage as unknown as ObjectStorageService,
    );

    await expect(
      controller.publishWorkerAction(
        { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, record },
        'Bearer credential',
      ),
    ).resolves.toEqual({ status: 'published' });
    expect(storage.headBlob).toHaveBeenCalledWith({
      namespace: 'blobs',
      key: `jobs/owner-1/sha256/${'b'.repeat(64)}`,
      tier: 'private',
    });
    expect(storage.putBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'blobs',
        key: `jobs/owner-1/actions/job-1/sha256/${'a'.repeat(64)}.json`,
        contentType: 'application/vnd.tau.compute-action+json',
        ifNoneMatch: '*',
        tier: 'private',
      }),
    );
    expect(jobs.isArtifactAttemptAuthorized).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      runnerId: 'device-authenticated',
      jobId: 'job-1',
      attemptId: 'attempt-1',
      attempt: 1,
    });
  });

  it('does not publish an action when its output content is absent', async () => {
    const jobs = {
      isRunnerAuthorized: vi.fn(async () => true),
      isArtifactAttemptAuthorized: vi.fn(async () => true),
    };
    const hosts = { authenticateDevice: vi.fn(async () => device) };
    const storage = {
      headBlob: vi.fn(async () => undefined),
      putBlob: vi.fn(),
    };
    const controller = new JobsController(
      jobs as unknown as JobsService,
      hosts as unknown as HostsService,
      storage as unknown as ObjectStorageService,
    );

    await expect(
      controller.publishWorkerAction(
        {
          jobId: 'job-1',
          attemptId: 'attempt-1',
          attempt: 1,
          record: {
            schemaVersion: 1,
            actionDigest: `sha256:${'a'.repeat(64)}`,
            codec: { id: 'openfoam-stage', version: '1' },
            output: {
              digest: `sha256:${'b'.repeat(64)}`,
              size: 42,
              mediaType: 'application/octet-stream',
            },
            dependencies: [],
          },
        },
        'Bearer credential',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storage.putBlob).not.toHaveBeenCalled();
  });

  it('reads only the exact job and owner scoped action after validating its references', async () => {
    const actionDigest = `sha256:${'c'.repeat(64)}` as const;
    const outputDigest = `sha256:${'d'.repeat(64)}` as const;
    const record = {
      schemaVersion: 1,
      actionDigest,
      codec: { id: 'openfoam-stage', version: '1' },
      output: { digest: outputDigest, size: 12, mediaType: 'application/octet-stream' },
      dependencies: [],
    } as const;
    const bytes = new TextEncoder().encode(JSON.stringify(record));
    const jobs = {
      isRunnerAuthorized: vi.fn(async () => true),
      isArtifactAttemptAuthorized: vi.fn(async () => true),
    };
    const hosts = { authenticateDevice: vi.fn(async () => device) };
    const storage = {
      headBlob: vi
        .fn()
        .mockResolvedValueOnce({
          contentType: 'application/vnd.tau.compute-action+json',
          size: bytes.byteLength,
          etag: 'action',
        })
        .mockResolvedValueOnce({ contentType: 'application/octet-stream', size: 12, etag: 'content' }),
      getBlob: vi.fn(async () => ({
        body: Readable.from([bytes]),
        contentType: 'application/vnd.tau.compute-action+json',
        etag: 'action',
      })),
    };
    const controller = new JobsController(
      jobs as unknown as JobsService,
      hosts as unknown as HostsService,
      storage as unknown as ObjectStorageService,
    );

    await expect(
      controller.readWorkerAction(
        { jobId: 'job-1', attemptId: 'attempt-2', attempt: 2, actionDigest },
        'Bearer credential',
      ),
    ).resolves.toEqual({ status: 'hit', record });
    expect(storage.headBlob).toHaveBeenNthCalledWith(1, {
      namespace: 'blobs',
      key: `jobs/owner-1/actions/job-1/sha256/${'c'.repeat(64)}.json`,
      tier: 'private',
    });
  });

  it('rejects action records outside the authenticated active attempt before storage access', async () => {
    const { controller, jobs } = harness();
    jobs.isArtifactAttemptAuthorized.mockResolvedValueOnce(false);

    await expect(
      controller.readWorkerAction(
        {
          jobId: 'job-other',
          attemptId: 'attempt-other',
          attempt: 1,
          actionDigest: `sha256:${'e'.repeat(64)}`,
        },
        'Bearer credential',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
