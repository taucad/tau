import { describe, expect, it, vi } from 'vitest';
import { CacheCorruptionError, unsupportedCacheMaintenance } from '@taucad/cache-core';
import type { ActionStore, ContentStore } from '@taucad/cache-core';
import { runOwnerScopedStoreConformance } from '@taucad/cache-core/testing';
import type { JobArtifactStore, JobAttemptIdentity, JobComputeActionRecord } from '@taucad/jobs';
import { createHttpJobArtifactStore } from '#http-job-artifact-store.js';

const toComputeStores = (input: {
  readonly store: JobArtifactStore;
  readonly attempt: JobAttemptIdentity;
}): { readonly contentStore: ContentStore; readonly actionStore: ActionStore } => {
  if (input.store.computeReuse.status !== 'supported') {
    throw new TypeError('The HTTP artifact store must support compute reuse.');
  }
  const { computeReuse } = input.store;
  return {
    contentStore: {
      async read({ digest }) {
        const outcome = await input.store.read({ digest, attempt: input.attempt });
        return outcome.found ? { status: 'hit', bytes: outcome.bytes } : { status: 'miss' };
      },
      async write({ digest, bytes }) {
        const outcome = await input.store.put({
          bytes,
          mediaType: 'application/octet-stream',
          attempt: input.attempt,
        });
        if (outcome.digest !== digest) {
          throw new CacheCorruptionError('HTTP storage returned a different content digest.');
        }
        return { status: 'stored' };
      },
      maintenance: unsupportedCacheMaintenance,
    },
    actionStore: {
      async read({ digest }) {
        return computeReuse.readAction({ digest, attempt: input.attempt });
      },
      async publish({ record }) {
        return computeReuse.publishAction({ record, attempt: input.attempt });
      },
      maintenance: unsupportedCacheMaintenance,
    },
  };
};

const createOwnerScopedRemote = (): typeof fetch => {
  const blobs = new Map<string, Uint8Array<ArrayBuffer>>();
  const actions = new Map<string, JobComputeActionRecord>();
  const signedRequests = new Map<string, { readonly operation: 'get' | 'put'; readonly key: string }>();
  let nextSignedRequest = 0;
  const signedUrl = (operation: 'get' | 'put', key: string): string => {
    const url = `https://objects.invalid/${operation}/${String(nextSignedRequest++)}`;
    signedRequests.set(url, { operation, key });
    return url;
  };

  // oxlint-disable-next-line eslint/complexity -- one stateful fake covers the complete HTTP data plane.
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = input instanceof URL || typeof input === 'string' ? String(input) : input.url;
    const signed = signedRequests.get(url);
    if (signed !== undefined) {
      if (signed.operation === 'put') {
        if (!(init?.body instanceof Uint8Array)) {
          return new Response(null, { status: 400 });
        }
        blobs.set(signed.key, new Uint8Array(init.body));
        return new Response(null, { status: 200 });
      }
      const bytes = blobs.get(signed.key);
      return bytes === undefined ? new Response(null, { status: 404 }) : new Response(bytes, { status: 200 });
    }

    const credential = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /u, '');
    const owner = credential === 'owner-one' ? 'owner-1' : credential === 'owner-two' ? 'owner-2' : undefined;
    if (owner === undefined || typeof init?.body !== 'string') {
      return new Response(null, { status: 401 });
    }
    const body = JSON.parse(init.body) as Record<string, unknown>;
    const jobId = String(body['jobId']);
    if (url.endsWith('/v1/jobs/worker-artifacts/uploads')) {
      const digest = String(body['digest']);
      const key = `${owner}:${digest}`;
      if (blobs.has(key)) {
        return Response.json({ mode: 'existing', storageKey: key });
      }
      return Response.json({
        mode: 'single',
        storageKey: key,
        uploadUrl: signedUrl('put', key),
        headers: { 'content-type': String(body['mediaType']) },
      });
    }
    if (url.endsWith('/v1/jobs/worker-artifacts/downloads')) {
      const key = `${owner}:${String(body['digest'])}`;
      return Response.json({ downloadUrl: signedUrl('get', key) });
    }
    if (url.endsWith('/v1/jobs/worker-artifacts/actions/read')) {
      const record = actions.get(`${owner}:${jobId}:${String(body['actionDigest'])}`);
      return Response.json(record === undefined ? { status: 'miss' } : { status: 'hit', record });
    }
    if (url.endsWith('/v1/jobs/worker-artifacts/actions/publish')) {
      const record = body['record'] as JobComputeActionRecord;
      const outputOwned = blobs.has(`${owner}:${record.output.digest}`);
      const dependenciesOwned = record.dependencies.every((dependency) =>
        actions.has(`${owner}:${jobId}:${dependency}`),
      );
      if (!outputOwned || !dependenciesOwned) {
        return Response.json({ code: 'MISSING_REFERENCE' }, { status: 409 });
      }
      const key = `${owner}:${jobId}:${record.actionDigest}`;
      const existing = actions.get(key);
      if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(record)) {
        return Response.json({ code: 'CONFLICT' }, { status: 409 });
      }
      actions.set(key, structuredClone(record));
      return Response.json({ status: existing === undefined ? 'published' : 'existing' });
    }
    return new Response(null, { status: 404 });
  });
};

describe('createHttpJobArtifactStore', () => {
  it('passes the shared authenticated owner-scoped store conformance suite', async () => {
    const fetchImplementation = createOwnerScopedRemote();
    const createStore = (credential: string, runnerId: string): JobArtifactStore =>
      createHttpJobArtifactStore({
        apiUrl: 'https://tau.invalid',
        credential,
        runnerId,
        fetch: fetchImplementation,
      });
    const primaryAttempt = { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' };
    const retryAttempt = { jobId: 'job-1', attemptId: 'attempt-2', attempt: 2, runnerId: 'runner-1' };
    const otherAttempt = { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-2' };

    await expect(
      runOwnerScopedStoreConformance({
        createStores: () => ({
          primary: toComputeStores({
            store: createStore('owner-one', 'runner-1'),
            attempt: primaryAttempt,
          }),
          sameOwner: toComputeStores({
            store: createStore('owner-one', 'runner-1'),
            attempt: retryAttempt,
          }),
          otherOwner: toComputeStores({
            store: createStore('owner-two', 'runner-2'),
            attempt: otherAttempt,
          }),
        }),
      }),
    ).resolves.toBeUndefined();
  });

  it('keeps bytes out of the control plane and round-trips through presigned URLs', async () => {
    const bytes = new TextEncoder().encode('result');
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = input instanceof URL || typeof input === 'string' ? String(input) : input.url;
      if (url.endsWith('/v1/jobs/worker-artifacts/uploads')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer paired-secret' });
        const body = typeof init?.body === 'string' ? init.body : '';
        expect(JSON.parse(body)).toMatchObject({ size: bytes.byteLength, mediaType: 'text/plain' });
        expect(body).not.toContain('result');
        return Response.json({
          mode: 'single',
          storageKey: 'jobs/owner/sha256/result',
          uploadUrl: 'https://objects.invalid/upload',
          headers: { 'content-type': 'text/plain', 'x-amz-checksum-sha256': 'checksum' },
        });
      }
      if (url === 'https://objects.invalid/upload') {
        expect(init?.method).toBe('PUT');
        expect(new Uint8Array(init?.body as Uint8Array<ArrayBuffer>)).toEqual(bytes);
        return new Response(null, { status: 200 });
      }
      if (url.endsWith('/v1/jobs/worker-artifacts/downloads')) {
        return Response.json({ downloadUrl: 'https://objects.invalid/download' });
      }
      if (url === 'https://objects.invalid/download') {
        return new Response(bytes, { status: 200 });
      }
      return new Response(null, { status: 500 });
    });
    const store = createHttpJobArtifactStore({
      apiUrl: 'https://tau.invalid',
      credential: 'paired-secret',
      runnerId: 'runner-1',
      fetch: fetchImplementation,
    });
    const attempt = { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' };

    expect(store.computeReuse.status).toBe('supported');

    const stored = await store.put({
      bytes,
      mediaType: 'text/plain',
      attempt,
    });
    expect(stored).toMatchObject({ size: bytes.byteLength, storageKey: 'jobs/owner/sha256/result' });
    await expect(store.read({ digest: stored.digest, attempt })).resolves.toEqual({ found: true, bytes });
  });

  it('round-trips owner-authorized action records through the control plane', async () => {
    const actionDigest = `sha256:${'a'.repeat(64)}` as JobComputeActionRecord['actionDigest'];
    const outputDigest = `sha256:${'b'.repeat(64)}` as JobComputeActionRecord['output']['digest'];
    const record: JobComputeActionRecord = {
      schemaVersion: 1,
      actionDigest,
      codec: { id: 'openfoam-stage', version: '1' },
      output: { digest: outputDigest, size: 42, mediaType: 'application/octet-stream' },
      dependencies: [],
    };
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = input instanceof URL || typeof input === 'string' ? String(input) : input.url;
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      expect(body).toMatchObject({ jobId: 'job-1', attemptId: 'attempt-2', attempt: 2 });
      if (url.endsWith('/v1/jobs/worker-artifacts/actions/read')) {
        expect(body['actionDigest']).toBe(actionDigest);
        return Response.json({ status: 'hit', record });
      }
      if (url.endsWith('/v1/jobs/worker-artifacts/actions/publish')) {
        expect(body['record']).toEqual(record);
        return Response.json({ status: 'published' });
      }
      return new Response(null, { status: 500 });
    });
    const store = createHttpJobArtifactStore({
      apiUrl: 'https://tau.invalid',
      credential: 'paired-secret',
      runnerId: 'runner-1',
      fetch: fetchImplementation,
    });
    const attempt = { jobId: 'job-1', attemptId: 'attempt-2', attempt: 2, runnerId: 'runner-1' };
    if (store.computeReuse.status !== 'supported') {
      expect.fail('HTTP job artifact store should support durable action records.');
    }

    const read = await store.computeReuse.readAction({ digest: actionDigest, attempt });
    expect(read).toEqual({
      status: 'hit',
      record,
    });
    if (read.status !== 'hit') {
      expect.fail('HTTP action lookup should return the stored record.');
    }
    await expect(store.computeReuse.publishAction({ record: read.record, attempt })).resolves.toEqual({
      status: 'published',
    });
  });

  it('rejects a download whose declared size exceeds the artifact limit before reading its body', async () => {
    const bytes = new TextEncoder().encode('result');
    const digest = `sha256:${'f6a214f7a5fcda0c2cee9660b7fc29f5649e3c68aad48e20e950137c98913a68'}` as const;
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = input instanceof URL || typeof input === 'string' ? String(input) : input.url;
      if (url.endsWith('/v1/jobs/worker-artifacts/downloads')) {
        return Response.json({ downloadUrl: 'https://objects.invalid/oversized' });
      }
      if (url === 'https://objects.invalid/oversized') {
        return new Response(bytes, {
          status: 200,
          headers: { 'content-length': String(1024 * 1024 * 1024 + 1) },
        });
      }
      return new Response(null, { status: 500 });
    });
    const store = createHttpJobArtifactStore({
      apiUrl: 'https://tau.invalid',
      credential: 'paired-secret',
      runnerId: 'runner-1',
      fetch: fetchImplementation,
    });

    await expect(
      store.read({
        digest,
        attempt: { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' },
      }),
    ).rejects.toThrow('exceeds');
  });

  it('bounds streamed control-plane responses and rejects malformed UTF-8 JSON', async () => {
    const actionDigest = `sha256:${'a'.repeat(64)}` as JobComputeActionRecord['actionDigest'];
    const bodies = [
      new TextEncoder().encode(JSON.stringify({ status: 'miss', padding: 'x'.repeat(128 * 1024) })),
      new Uint8Array([0xff]),
    ];
    const fetchImplementation = vi.fn<typeof fetch>(async () => new Response(bodies.shift(), { status: 200 }));
    const store = createHttpJobArtifactStore({
      apiUrl: 'https://tau.invalid',
      credential: 'paired-secret',
      runnerId: 'runner-1',
      fetch: fetchImplementation,
    });
    const attempt = { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' };
    if (store.computeReuse.status !== 'supported') {
      expect.fail('HTTP job artifact store should support durable action records.');
    }

    await expect(store.computeReuse.readAction({ digest: actionDigest, attempt })).rejects.toThrow('exceeds');
    await expect(store.computeReuse.readAction({ digest: actionDigest, attempt })).rejects.toThrow('UTF-8 JSON');
  });

  it('rejects action records whose declared output exceeds the artifact limit', async () => {
    const actionDigest = `sha256:${'a'.repeat(64)}` as JobComputeActionRecord['actionDigest'];
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: 'hit',
        record: {
          schemaVersion: 1,
          actionDigest,
          codec: { id: 'stage', version: '1' },
          output: {
            digest: `sha256:${'b'.repeat(64)}`,
            size: 1024 * 1024 * 1024 + 1,
            mediaType: 'application/octet-stream',
          },
          dependencies: [],
        },
      }),
    );
    const store = createHttpJobArtifactStore({
      apiUrl: 'https://tau.invalid',
      credential: 'paired-secret',
      runnerId: 'runner-1',
      fetch: fetchImplementation,
    });
    if (store.computeReuse.status !== 'supported') {
      expect.fail('HTTP job artifact store should support durable action records.');
    }

    await expect(
      store.computeReuse.readAction({
        digest: actionDigest,
        attempt: { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' },
      }),
    ).rejects.toThrow('action output exceeds');
  });

  it('rejects oversized outbound action records before making a remote request', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const store = createHttpJobArtifactStore({
      apiUrl: 'https://tau.invalid',
      credential: 'paired-secret',
      runnerId: 'runner-1',
      fetch: fetchImplementation,
    });
    if (store.computeReuse.status !== 'supported') {
      expect.fail('HTTP job artifact store should support durable action records.');
    }
    const attempt = { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' };
    const record: JobComputeActionRecord = {
      schemaVersion: 1,
      actionDigest: `sha256:${'a'.repeat(64)}` as JobComputeActionRecord['actionDigest'],
      codec: { id: 'x'.repeat(64 * 1024), version: '1' },
      output: {
        digest: `sha256:${'b'.repeat(64)}` as JobComputeActionRecord['output']['digest'],
        size: 1,
        mediaType: 'application/octet-stream',
      },
      dependencies: [],
    };

    await expect(store.computeReuse.publishAction({ record, attempt })).rejects.toThrow('action record exceeds');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects a foreign runner identity before making a remote request', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const store = createHttpJobArtifactStore({
      apiUrl: 'https://tau.invalid',
      credential: 'paired-secret',
      runnerId: 'runner-1',
      fetch: fetchImplementation,
    });

    await expect(
      store.read({
        digest: `sha256:${'a'.repeat(64)}`,
        attempt: { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-2' },
      }),
    ).rejects.toThrow('configured runner attempt identity');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('retries interrupted multipart parts and completes them in sequence', async () => {
    const bytes = new Uint8Array(32 * 1024 * 1024 + 1).fill(7);
    const uploadedSizes: number[] = [];
    let interrupted = false;
    let completedParts: unknown;
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = input instanceof URL || typeof input === 'string' ? String(input) : input.url;
      if (url.endsWith('/v1/jobs/worker-artifacts/uploads')) {
        return Response.json({
          mode: 'multipart',
          storageKey: 'jobs/owner/sha256/large',
          uploadId: 'upload-1',
          partSize: 16 * 1024 * 1024,
        });
      }
      if (url.endsWith('/v1/jobs/worker-artifacts/uploads/parts')) {
        if (typeof init?.body !== 'string') {
          throw new TypeError('expected JSON body');
        }
        const body = JSON.parse(init.body) as { partNumber: number };
        return Response.json({
          uploadUrl: `https://objects.invalid/part-${String(body.partNumber)}`,
          headers: { 'x-amz-checksum-sha256': 'checksum' },
        });
      }
      if (url === 'https://objects.invalid/part-2' && !interrupted) {
        interrupted = true;
        return new Response(null, { status: 503 });
      }
      if (url.startsWith('https://objects.invalid/part-')) {
        if (!(init?.body instanceof Uint8Array)) {
          throw new TypeError('expected byte body');
        }
        uploadedSizes.push(init.body.byteLength);
        return new Response(null, { status: 200, headers: { etag: `"${url.at(-1)}"` } });
      }
      if (url.endsWith('/v1/jobs/worker-artifacts/uploads/complete')) {
        if (typeof init?.body !== 'string') {
          throw new TypeError('expected JSON body');
        }
        completedParts = (JSON.parse(init.body) as { parts: unknown }).parts;
        return Response.json({ completed: true });
      }
      return new Response(null, { status: 500 });
    });
    const store = createHttpJobArtifactStore({
      apiUrl: 'https://tau.invalid',
      credential: 'paired-secret',
      runnerId: 'runner-1',
      fetch: fetchImplementation,
    });

    const stored = await store.put({
      bytes,
      mediaType: 'application/octet-stream',
      attempt: { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' },
    });

    expect(interrupted).toBe(true);
    expect(uploadedSizes.toSorted((a, b) => a - b)).toEqual([1, 16 * 1024 * 1024, 16 * 1024 * 1024]);
    expect(completedParts).toEqual([
      expect.objectContaining({ partNumber: 1, etag: '"1"' }),
      expect.objectContaining({ partNumber: 2, etag: '"2"' }),
      expect.objectContaining({ partNumber: 3, etag: '"3"' }),
    ]);
    expect(stored).toMatchObject({ size: bytes.byteLength, storageKey: 'jobs/owner/sha256/large' });
  });
});
