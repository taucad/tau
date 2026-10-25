import { ForbiddenException, NotFoundException, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Auth } from 'better-auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { ProjectDeletionController } from '#api/projects/project-deletion.controller.js';
import {
  completeProjectDeletion,
  readOwnedProjectDeletion,
  requestProjectDeletion,
} from '#api/projects/project-deletion.js';
import type { ProjectDeletionStatus } from '#api/projects/project-deletion.js';
import { gitExecutorKey } from '#api/git/forwarding/git-executor.js';
import type { GitExecutor } from '#api/git/forwarding/git-executor.js';
import { AuthGuard } from '#auth/auth.guard.js';
import type { Environment } from '#config/environment.config.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { DatabaseService } from '#database/database.service.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';

// The HTTP adapter, guard and exception filter are real. The durable deletion
// protocol is mocked here; its PostgreSQL and storage semantics have separate tests.
vi.mock('#api/projects/project-deletion.js', () => ({
  completeProjectDeletion: vi.fn(),
  readOwnedProjectDeletion: vi.fn(),
  requestProjectDeletion: vi.fn(),
}));

describe('ProjectDeletionController over HTTP', () => {
  const projectId = 'proj_controllerfixture';
  const ownerId = 'user-controller-owner';
  const deletedAt = '2026-10-24T00:00:00.000Z';
  const databaseService = Object.assign(mock<DatabaseService>(), { database: mock<DatabaseService['database']>() });
  const executor = mock<GitExecutor>();
  const config = mock<ConfigService<Environment, true>>();
  const auth = mockDeep<Auth>();
  const signedIn = {
    user: {
      id: ownerId,
      name: 'Fixture',
      email: 'fixture@tau.test',
      emailVerified: true,
      createdAt: new Date(deletedAt),
      updatedAt: new Date(deletedAt),
      image: null,
    },
    session: {
      id: 'fixture-session',
      userId: ownerId,
      token: 'fixture-token',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      createdAt: new Date(deletedAt),
      updatedAt: new Date(deletedAt),
      ipAddress: null,
      userAgent: null,
    },
  };
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectDeletionController],
      providers: [
        Reflector,
        AuthGuard,
        { provide: authInstanceKey, useValue: auth },
        { provide: ConfigService, useValue: config },
        { provide: DatabaseService, useValue: databaseService },
        { provide: gitExecutorKey, useValue: executor },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    config.get.mockReturnValue(true);
    auth.api.getSession.mockResolvedValue(signedIn);
    vi.mocked(requestProjectDeletion).mockResolvedValue();
    vi.mocked(completeProjectDeletion).mockResolvedValue({ projectId, state: 'deleted', deletedAt });
    vi.mocked(readOwnedProjectDeletion).mockResolvedValue({ projectId, state: 'active' });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['GET', 'DELETE'] as const)(
    'should require authentication for %s before invoking deletion work',
    async (method) => {
      auth.api.getSession.mockResolvedValue(null);
      const response = await app.inject({
        method,
        url: `/v1/projects/${projectId}${method === 'GET' ? '/deletion' : ''}`,
      });
      expect(response.statusCode).toBe(401);
      expect(response.json<{ code: string }>().code).toBe('UNAUTHORIZED');
      expect(readOwnedProjectDeletion).not.toHaveBeenCalled();
      expect(requestProjectDeletion).not.toHaveBeenCalled();
      expect(completeProjectDeletion).not.toHaveBeenCalled();
    },
  );

  it.each(['GET', 'DELETE'] as const)(
    'should reject unsafe ids on %s before invoking deletion work',
    async (method) => {
      await Promise.all(
        ['bad.id', '-starts-with-dash', 'a'.repeat(65)].map(async (id) => {
          const response = await app.inject({
            method,
            url: `/v1/projects/${id}${method === 'GET' ? '/deletion' : ''}`,
          });
          expect(response.statusCode).toBe(400);
          expect(response.json<{ code: string; error: string }>()).toMatchObject({
            code: 'PROJECT_ID_INVALID',
            error: 'Not a project id',
          });
        }),
      );
      expect(readOwnedProjectDeletion).not.toHaveBeenCalled();
      expect(requestProjectDeletion).not.toHaveBeenCalled();
      expect(completeProjectDeletion).not.toHaveBeenCalled();
    },
  );

  it.each(['legacy-repo_7', 'a', 'a'.repeat(64)])(
    'should accept existing storage-safe repository id %s without a manifest prefix',
    async (id) => {
      vi.mocked(completeProjectDeletion).mockResolvedValue({ projectId: id, state: 'deleted', deletedAt });
      const response = await app.inject({ method: 'DELETE', url: `/v1/projects/${id}` });
      expect(response.statusCode).toBe(200);
      expect(response.json<ProjectDeletionStatus>()).toEqual({ projectId: id, state: 'deleted', deletedAt });
      expect(requestProjectDeletion).toHaveBeenCalledWith({
        database: databaseService.database,
        projectId: id,
        userId: ownerId,
        enabled: true,
      });
    },
  );

  it.each(['active', 'deleting', 'deleted'] as const)(
    'should return %s status with 200 and private no-store caching',
    async (state) => {
      const result: ProjectDeletionStatus = { projectId, state, ...(state === 'deleted' ? { deletedAt } : {}) };
      vi.mocked(readOwnedProjectDeletion).mockResolvedValue(result);
      // Status and retries must stay available when admission is switched off.
      config.get.mockReturnValue(false);
      const response = await app.inject({ method: 'GET', url: `/v1/projects/${projectId}/deletion` });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.json<ProjectDeletionStatus>()).toEqual(result);
      expect(readOwnedProjectDeletion).toHaveBeenCalledWith(databaseService.database, projectId, ownerId);
      expect(requestProjectDeletion).not.toHaveBeenCalled();
      expect(completeProjectDeletion).not.toHaveBeenCalled();
    },
  );

  it.each([
    { state: 'deleting', status: 202 },
    { state: 'deleted', status: 200 },
  ] as const)(
    'should return $status only after intent and storage completion yield $state',
    async ({ state, status }) => {
      const result: ProjectDeletionStatus = { projectId, state, ...(state === 'deleted' ? { deletedAt } : {}) };
      const events: string[] = [];
      vi.mocked(requestProjectDeletion).mockImplementation(async () => {
        events.push('intent');
      });
      vi.mocked(completeProjectDeletion).mockImplementation(async () => {
        events.push('complete');
        return result;
      });
      const response = await app.inject({ method: 'DELETE', url: `/v1/projects/${projectId}` });
      expect(response.statusCode).toBe(status);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.json<ProjectDeletionStatus>()).toEqual(result);
      expect(events).toEqual(['intent', 'complete']);
      expect(requestProjectDeletion).toHaveBeenCalledWith({
        database: databaseService.database,
        projectId,
        userId: ownerId,
        enabled: true,
      });
      const completion = vi.mocked(completeProjectDeletion).mock.calls[0]?.[0];
      expect(completion?.database).toBe(databaseService.database);
      expect(completion?.projectId).toBe(projectId);
      /* DC1: the fence is tau-storage's tombstone, under a grant for the requester. */
      executor.tombstone.mockResolvedValue({ tombstonedAt: deletedAt, purgeAfter: deletedAt });
      await completion?.fence(
        { locator: { ownerId, projectId }, committedBy: ownerId, at: new Date(deletedAt) },
        AbortSignal.timeout(5000),
      );
      expect(executor.tombstone).toHaveBeenCalledWith(
        expect.objectContaining({ owner: ownerId, project: projectId, committedBy: ownerId }),
        expect.objectContaining({ abort: expect.any(AbortSignal) as unknown }),
      );
    },
  );

  it('should forward disabled admission while allowing the protocol to resume an existing deletion', async () => {
    config.get.mockReturnValue(false);
    const response = await app.inject({ method: 'DELETE', url: `/v1/projects/${projectId}` });
    expect(response.statusCode).toBe(200);
    expect(response.json<ProjectDeletionStatus>()).toEqual({ projectId, state: 'deleted', deletedAt });
    expect(requestProjectDeletion).toHaveBeenCalledWith({
      database: databaseService.database,
      projectId,
      userId: ownerId,
      enabled: false,
    });
  });

  it.each([
    {
      error: new ForbiddenException({
        code: 'PROJECT_DELETION_DISABLED',
        message: 'Cloud project deletion is not available yet.',
      }),
      status: 403,
      code: 'PROJECT_DELETION_DISABLED',
    },
    { error: new ForbiddenException('Only the owner can delete this cloud project'), status: 403, code: 'FORBIDDEN' },
    { error: new NotFoundException('Project not found'), status: 404, code: 'NOT_FOUND' },
  ])('should preserve admission error $code and never attempt the storage fence', async ({ error, status, code }) => {
    vi.mocked(requestProjectDeletion).mockRejectedValue(error);
    const response = await app.inject({ method: 'DELETE', url: `/v1/projects/${projectId}` });
    expect(response.statusCode).toBe(status);
    expect(response.json<{ code: string; error: string }>()).toMatchObject({ code, error: error.message });
    expect(completeProjectDeletion).not.toHaveBeenCalled();
  });

  it('should preserve status authorization errors without starting deletion', async () => {
    vi.mocked(readOwnedProjectDeletion).mockRejectedValue(new NotFoundException('Project not found'));
    const response = await app.inject({ method: 'GET', url: `/v1/projects/${projectId}/deletion` });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ code: string; error: string }>()).toMatchObject({
      code: 'NOT_FOUND',
      error: 'Project not found',
    });
    expect(requestProjectDeletion).not.toHaveBeenCalled();
    expect(completeProjectDeletion).not.toHaveBeenCalled();
  });

  it('should not report success or expose internal details when completion unexpectedly fails', async () => {
    vi.mocked(completeProjectDeletion).mockRejectedValue(new Error('private storage failure details'));
    const response = await app.inject({ method: 'DELETE', url: `/v1/projects/${projectId}` });
    expect(response.statusCode).toBe(500);
    expect(response.json<{ code: string }>()).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(response.body).not.toContain('private storage failure details');
  });
});
