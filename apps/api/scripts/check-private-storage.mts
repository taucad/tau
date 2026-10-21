#!/usr/bin/env node
/**
 * Exercise API-issued private storage, rather than treating health/signing as upload success.
 * Required: TAU_STORAGE_PROBE_PROJECT (disposable staging project), TAU_AUTH_TOKEN (hidden env).
 * Optional: TAU_STORAGE_PROBE_BYTES (1..104857600, default 1024).
 * Usage: pnpm nx run api:probe:private-storage
 * Writes one generated fixture, retained for normal project cleanup; never deletes user data.
 * Exit 0 means PUT/verify/GET, checksum replay protection and exact-origin CORS passed; 1 means failure.
 * Credentials, signed URLs and provider response bodies are never printed. Production is refused.
 */
import { createHash, randomBytes } from 'node:crypto';
import process from 'node:process';
import { permitsPrivatePut } from '#storage/private-storage-probe.js';
import { z } from 'zod';

const actionSchema = z.object({ href: z.url(), header: z.record(z.string(), z.string()).optional() });
const batchSchema = z.object({
  objects: z.array(
    z.object({
      oid: z.string(),
      size: z.number(),
      actions: z
        .object({ upload: actionSchema.optional(), verify: actionSchema.optional(), download: actionSchema.optional() })
        .optional(),
    }),
  ),
});
const apiOrigin = 'https://api.taucad.dev';
const storageOrigin = 'https://271cffba9907a76320b6a4993f756601.r2.cloudflarestorage.com';
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error('missing-input');
  }
  return value;
};
const requireOk = (condition: boolean): void => {
  if (!condition) {
    throw new Error('probe-failed');
  }
};
const main = async (): Promise<void> => {
  const project = required('TAU_STORAGE_PROBE_PROJECT');
  requireOk(/^[a-zA-Z0-9_-]+$/u.test(project));
  const token = required('TAU_AUTH_TOKEN');
  const size = Number(process.env['TAU_STORAGE_PROBE_BYTES'] ?? 1024);
  requireOk(Number.isSafeInteger(size) && size > 0 && size <= 104_857_600);
  const bytes = Uint8Array.from(randomBytes(size));
  const oid = createHash('sha256').update(bytes).digest('hex');
  const signal = AbortSignal.timeout(300_000);
  const api = async (url: string, body: unknown): Promise<Response> => {
    requireOk(new URL(url).origin === apiOrigin);
    return fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.git-lfs+json' },
      body: JSON.stringify(body),
    });
  };
  const batch = async (operation: 'upload' | 'download') => {
    const result = await api(`${apiOrigin}/v1/git/${project}.git/info/lfs/objects/batch`, {
      operation,
      transfers: ['basic'],
      objects: [{ oid, size }],
    });
    requireOk(result.ok);
    const { objects } = batchSchema.parse(await result.json());
    const [object] = objects;
    requireOk(objects.length === 1 && object?.oid === oid && object.size === size);
    return object?.actions;
  };
  const actions = await batch('upload');
  const upload = actions?.upload;
  const verify = actions?.verify;
  if (!upload || !verify) {
    throw new Error('missing-actions');
  }
  requireOk(new URL(upload.href).origin === storageOrigin);
  const headers = new Headers(upload.header);
  requireOk(headers.has('x-amz-checksum-sha256') && !headers.has('authorization'));
  const signedHeaders = new URL(upload.href).searchParams.get('X-Amz-SignedHeaders') ?? '';
  requireOk(signedHeaders.split(';').includes('x-amz-checksum-sha256'));
  const requestedHeaders = [...headers.keys()].filter((name) => name !== 'content-length');
  for (const origin of ['https://taucad.dev', 'https://taucad-staging.netlify.app', 'app://tau']) {
    // oxlint-disable-next-line no-await-in-loop -- each supported origin is an independent preflight.
    const preflight = await fetch(upload.href, {
      method: 'OPTIONS',
      signal,
      redirect: 'error',
      headers: {
        origin,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': requestedHeaders.join(', '),
      },
    });
    requireOk(permitsPrivatePut(preflight, origin, requestedHeaders));
    // oxlint-disable-next-line no-await-in-loop -- consume this preflight before the next.
    await preflight.body?.cancel();
  }
  const denied = await fetch(upload.href, {
    method: 'OPTIONS',
    signal,
    redirect: 'error',
    headers: {
      origin: 'https://not-tau.invalid',
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'x-amz-checksum-sha256',
    },
  });
  requireOk(denied.headers.get('access-control-allow-origin') === null);
  await denied.body?.cancel();
  headers.set('origin', 'https://taucad.dev');
  const put = async (): Promise<Response> =>
    fetch(upload.href, {
      method: 'PUT',
      headers,
      body: bytes,
      credentials: 'omit',
      redirect: 'error',
      signal,
    });
  bytes[0] = (bytes[0]! + 1) % 256;
  const badBefore = await put();
  requireOk(badBefore.status === 400);
  await badBefore.body?.cancel();
  bytes[0] = (bytes[0] + 255) % 256;
  const good = await put();
  requireOk(good.ok && good.headers.get('access-control-allow-origin') === 'https://taucad.dev');
  await good.body?.cancel();
  const finalized = await api(verify.href, { oid, size });
  requireOk(finalized.ok);
  await finalized.body?.cancel();
  const repeated = await api(verify.href, { oid, size });
  requireOk(repeated.ok);
  await repeated.body?.cancel();
  bytes[0] = (bytes[0] + 1) % 256;
  const badAfter = await put();
  requireOk(badAfter.status === 400);
  await badAfter.body?.cancel();
  const downloadActions = await batch('download');
  const download = downloadActions?.download;
  if (!download) {
    throw new Error('missing-download');
  }
  requireOk(new URL(download.href).origin === storageOrigin);
  const downloaded = await fetch(download.href, {
    headers: { ...download.header, origin: 'https://taucad.dev' },
    signal,
    redirect: 'error',
    credentials: 'omit',
  });
  requireOk(downloaded.ok && downloaded.headers.get('access-control-allow-origin') === 'https://taucad.dev');
  const digest = createHash('sha256');
  let received = 0;
  const reader = downloaded.body?.getReader();
  if (!reader) {
    throw new Error('missing-body');
  }
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      received += chunk.value.byteLength;
      requireOk(received <= size);
      digest.update(chunk.value);
      // oxlint-disable-next-line no-await-in-loop -- streaming bounds memory and rejects excess bytes.
      chunk = await reader.read();
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  requireOk(received === size && digest.digest('hex') === oid);
  console.log(
    JSON.stringify({
      status: 'passed',
      bytes: received,
      oid,
      checksumReplay: 'rejected',
      finalization: 'idempotent',
      corsOrigins: 3,
    }),
  );
};
try {
  await main();
} catch {
  console.error(
    'Private storage probe failed. Check inputs and staging transfer configuration; sensitive diagnostics suppressed.',
  );
  process.exit(1);
}
