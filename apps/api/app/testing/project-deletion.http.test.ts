import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { FastifyInstance } from 'fastify';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ProjectDeletionController } from '#api/projects/project-deletion.controller.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { gitExecutorKey } from '#api/git/forwarding/git-executor.js';
import { startStorageHop } from '#testing/storage-hop.js';
import type { StorageHop } from '#testing/storage-hop.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import {
  hashHostGitCredential,
  mintHostGitCredential,
  resolveHostGitCredential,
} from '#api/hosts/host-git-credential.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { staticAuthConfig } from '#config/auth.js';
import type { Environment } from '#config/environment.config.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { corsBaseConfiguration } from '#constants/cors.constant.js';
import { DatabaseService } from '#database/database.service.js';
import type { Database } from '#database/owner-lock.js';
import { readProjectDeletion } from '#database/project-lifecycle.js';
import * as schema from '#database/schema.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { createTauCorsOriginValidator } from '#utils/cors.utils.js';
import { createDeletionDatabase, seedDeletionProject } from '#testing/project-deletion.fixture.js';

/** Real HTTP controller, session lookup, SQL transactions, S3 adapter and MinIO CAS. */
describe('project deletion HTTP against isolated PostgreSQL and MinIO', () => {
  let client: postgres.Sql | undefined;
  let database: Database;
  let app: NestFastifyApplication | undefined;
  let fastify: FastifyInstance;
  let storage: ObjectStorageService;
  /** DC1: tau-storage commits the deletion's tombstone. */
  let hop: StorageHop | undefined;
  let config: ConfigService<Environment, true>;

  const sessionHeaders = async (userId: string) => {
    const token = randomBytes(32).toString('hex');
    await database
      .insert(schema.session)
      .values({ id: randomUUID(), token, userId, expiresAt: new Date(Date.now() + 3_600_000), updatedAt: new Date() });
    return { authorization: `Bearer ${token}` };
  };

  beforeAll(async () => {
    const marker: unknown = Reflect.get(process.env, 'CPD_ACCEPTANCE_MINIO_CONTAINER');
    const endpoint = new URL(process.env.TAU_S3_ENDPOINT);
    if (
      typeof marker !== 'string' ||
      !/^cpd07-acceptance-minio-[a-f\d]+$/u.test(marker) ||
      endpoint.hostname !== '127.0.0.1' ||
      !endpoint.port ||
      endpoint.port === '9000'
    ) {
      throw new Error('Deletion HTTP acceptance requires its owned alternate-port MinIO.');
    }
    if (process.env.TAU_S3_BUCKET !== 'cpd07-public' || process.env.TAU_S3_PRIVATE_BUCKET !== 'cpd07-private') {
      throw new Error('Deletion HTTP acceptance requires its dedicated bucket names.');
    }
    ({ client, database } = await createDeletionDatabase());
    /* eslint-disable @typescript-eslint/naming-convention -- application environment keys */
    config = new ConfigService<Environment, true>({
      TAU_PROJECT_DELETION_ENABLED: true,
      TAU_S3_ENDPOINT: endpoint.origin,
      TAU_S3_REGION: 'us-east-1',
      TAU_S3_ACCESS_KEY_ID: process.env.TAU_S3_ACCESS_KEY_ID,
      TAU_S3_SECRET_ACCESS_KEY: process.env.TAU_S3_SECRET_ACCESS_KEY,
      TAU_S3_FORCE_PATH_STYLE: true,
      TAU_S3_BUCKET: 'cpd07-public',
      TAU_S3_PRIVATE_BUCKET: 'cpd07-private',
      TAU_S3_PUBLIC_BASE_URL: `${endpoint.origin}/cpd07-public`,
    });
    /* eslint-enable @typescript-eslint/naming-convention -- end environment keys */
    const provisioner = new S3Client({
      endpoint: endpoint.origin,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get('TAU_S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('TAU_S3_SECRET_ACCESS_KEY', { infer: true }),
      },
    });
    try {
      await Promise.all(
        ['cpd07-public', 'cpd07-private', 'cpd07-restore'].map(async (bucket) => {
          try {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- AWS SDK request field
            await provisioner.send(new CreateBucketCommand({ Bucket: bucket }));
          } catch (error) {
            if (!(error instanceof Error) || error.name !== 'BucketAlreadyOwnedByYou') {
              throw error;
            }
          }
        }),
      );
    } finally {
      provisioner.destroy();
    }
    storage = new ObjectStorageService(config);
    const auth = betterAuth({
      ...staticAuthConfig,
      database: drizzleAdapter(database, { provider: 'pg' }),
      baseURL: 'http://127.0.0.1',
      secret: randomBytes(32).toString('hex'),
      rateLimit: { enabled: false },
    });
    hop = await startStorageHop({ store: new S3RepositoryStore(storage) });
    const module = await Test.createTestingModule({
      controllers: [ProjectDeletionController],
      providers: [
        Reflector,
        AuthGuard,
        { provide: authInstanceKey, useValue: auth },
        { provide: DatabaseService, useValue: Object.assign(mock<DatabaseService>(), { database }) },
        { provide: gitExecutorKey, useValue: hop.forwarder },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
    app.enableVersioning({ type: VersioningType.URI });
    app.enableCors({
      ...corsBaseConfiguration,
      origin: createTauCorsOriginValidator('https://tau.new', [], 'production'),
    });
    fastify = app.getHttpAdapter().getInstance();
    await app.init();
    await fastify.ready();
  });
  afterAll(async () => {
    await app?.close();
    await hop?.close();
    await client?.end();
  });

  it('should return 401 for signed-out and valid host-device Git credentials without creating intent', async () => {
    const fixture = await seedDeletionProject(database);
    const credential = mintHostGitCredential();
    const deviceId = `device_${randomUUID()}`;
    await database.insert(schema.hostDevice).values({
      id: deviceId,
      ownerId: fixture.ownerId,
      label: 'Acceptance cloud host',
      credentialHash: hashHostGitCredential(randomUUID()),
      gitCredentialHash: hashHostGitCredential(credential),
      cloudProjectId: fixture.projectId,
    });
    expect(await resolveHostGitCredential(Object.assign(mock<DatabaseService>(), { database }), credential)).toEqual({
      ownerId: fixture.ownerId,
      deviceId,
      projectId: fixture.projectId,
    });
    const url = `/v1/projects/${fixture.projectId}`;
    const anonymous = await fastify.inject({ method: 'DELETE', url });
    const hostBearer = await fastify.inject({
      method: 'DELETE',
      url,
      headers: { authorization: `Bearer ${credential}` },
    });
    const hostBasic = await fastify.inject({
      method: 'DELETE',
      url,
      headers: { authorization: `Basic ${Buffer.from(`host:${credential}`).toString('base64')}` },
    });
    expect([anonymous.statusCode, hostBearer.statusCode, hostBasic.statusCode]).toEqual([401, 401, 401]);
    expect(await readProjectDeletion(database, fixture.projectId)).toBeUndefined();
  });

  it('should authorize owner sessions freshly and fence MinIO before acknowledging deletion', async () => {
    const fixture = await seedDeletionProject(database);
    const url = `/v1/projects/${fixture.projectId}`;
    const ownerHeaders = await sessionHeaders(fixture.ownerId);
    const readerHeaders = await sessionHeaders(fixture.readerId);
    const strangerHeaders = await sessionHeaders(fixture.strangerId);
    const reader = await fastify.inject({ method: 'DELETE', url, headers: readerHeaders });
    const stranger = await fastify.inject({ method: 'DELETE', url, headers: strangerHeaders });
    expect([reader.statusCode, stranger.statusCode]).toEqual([403, 404]);
    expect(await readProjectDeletion(database, fixture.projectId)).toBeUndefined();
    const active = await fastify.inject({ method: 'GET', url: `${url}/deletion`, headers: ownerHeaders });
    expect(active.statusCode).toBe(200);
    expect(active.json()).toEqual({ projectId: fixture.projectId, state: 'active' });
    const deleted = await fastify.inject({ method: 'DELETE', url, headers: ownerHeaders });
    expect(deleted.statusCode).toBe(200);
    const body = deleted.json<{ projectId: string; state: string; deletedAt: string }>();
    expect(body).toMatchObject({ projectId: fixture.projectId, state: 'deleted' });
    expect(deleted.headers['cache-control']).toBe('private, no-store');
    const stored = await new S3RepositoryStore(storage).readManifest(fixture);
    if (!stored) {
      throw new Error('HTTP success did not persist a MinIO fence');
    }
    expect(decodeManifest(stored.manifest).tombstone?.tombstonedAt).toBe(body.deletedAt);
    const repeat = await fastify.inject({ method: 'DELETE', url, headers: ownerHeaders });
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json()).toEqual(body);
    const status = await fastify.inject({ method: 'GET', url: `${url}/deletion`, headers: ownerHeaders });
    expect(status.json()).toEqual(body);
    const hidden = await fastify.inject({ method: 'GET', url: `${url}/deletion`, headers: strangerHeaders });
    expect(hidden.statusCode).toBe(404);
  });

  it('should return 202 for a storage outage and finalize the same deletion on retry', async () => {
    const fixture = await seedDeletionProject(database);
    const headers = await sessionHeaders(fixture.ownerId);
    const url = `/v1/projects/${fixture.projectId}`;
    const fault = vi.spyOn(storage, 'getBlob').mockRejectedValueOnce(new TypeError('fixture storage outage'));
    try {
      const response = await fastify.inject({ method: 'DELETE', url, headers });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ projectId: fixture.projectId, state: 'deleting' });
    } finally {
      fault.mockRestore();
    }
    const intent = await readProjectDeletion(database, fixture.projectId);
    const status = await fastify.inject({ method: 'GET', url: `${url}/deletion`, headers });
    expect(status.json()).toEqual({ projectId: fixture.projectId, state: 'deleting' });
    const response = await fastify.inject({ method: 'DELETE', url, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ state: 'deleted' });
    const receipt = await readProjectDeletion(database, fixture.projectId);
    expect(receipt?.requestedAt).toEqual(intent?.requestedAt);
  });

  it('should permit web and desktop preflight origins but deny a hostile origin and POST method overrides', async () => {
    const fixture = await seedDeletionProject(database);
    const url = `/v1/projects/${fixture.projectId}`;
    for (const origin of ['https://tau.new', 'app://tau']) {
      // oxlint-disable-next-line no-await-in-loop -- assert each canonical caller origin independently
      const preflight = await fastify.inject({
        method: 'OPTIONS',
        url,
        headers: {
          origin,
          'access-control-request-method': 'DELETE',
          'access-control-request-headers': 'authorization',
        },
      });
      expect(preflight.statusCode).toBe(204);
      expect(preflight.headers['access-control-allow-origin']).toBe(origin);
      expect(preflight.headers['access-control-allow-methods']).toContain('DELETE');
    }
    const hostile = await fastify.inject({
      method: 'OPTIONS',
      url,
      headers: {
        origin: 'https://tau.new.attacker.invalid',
        'access-control-request-method': 'DELETE',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(hostile.headers['access-control-allow-origin']).toBeUndefined();
    const headers = await sessionHeaders(fixture.ownerId);
    const post = await fastify.inject({
      method: 'POST',
      url,
      headers: {
        ...headers,
        origin: 'https://attacker.invalid',
        'content-type': 'application/x-www-form-urlencoded',
        'x-http-method-override': 'DELETE',
      },
      payload: '_method=DELETE',
    });
    expect(post.statusCode).toBe(404);
    expect(await readProjectDeletion(database, fixture.projectId)).toBeUndefined();
  });

  it('should reject malformed IDs and disabled admission while keeping owner status readable', async () => {
    const fixture = await seedDeletionProject(database);
    const headers = await sessionHeaders(fixture.ownerId);
    const malformed = await fastify.inject({ method: 'DELETE', url: '/v1/projects/bad%2Fid', headers });
    expect(malformed.statusCode).toBe(400);
    config.set('TAU_PROJECT_DELETION_ENABLED', false);
    try {
      const disabled = await fastify.inject({ method: 'DELETE', url: `/v1/projects/${fixture.projectId}`, headers });
      expect(disabled.statusCode).toBe(403);
      expect(disabled.json()).toMatchObject({ code: 'PROJECT_DELETION_DISABLED' });
      const status = await fastify.inject({
        method: 'GET',
        url: `/v1/projects/${fixture.projectId}/deletion`,
        headers,
      });
      expect(status.json()).toEqual({ projectId: fixture.projectId, state: 'active' });
      expect(await readProjectDeletion(database, fixture.projectId)).toBeUndefined();
    } finally {
      config.set('TAU_PROJECT_DELETION_ENABLED', true);
    }
  });
});
