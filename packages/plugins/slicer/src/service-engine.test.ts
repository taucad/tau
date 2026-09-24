import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readTriangleMesh } from '#glb-mesh.js';
import type { TriangleMesh } from '#glb-mesh.js';
import { ServiceEngineError, serviceLimits, sliceWithService } from '#service-engine.js';
import { resolveSlicerOptions, slicerOptionsSchema } from '#slicer-options.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const token = 'test-token-0123456789abcdef0123456789abcdef';
const artifact = Uint8Array.from({ length: (3 * 1024 * 1024) / 2 }, (_, index) => (index * 131 + 17) % 256);
const artifactSha256 = createHash('sha256').update(artifact).digest('hex');
const readBody = async (request: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of request) {
    chunks.push(Uint8Array.from(chunk as Uint8Array<ArrayBuffer>));
  }
  return Uint8Array.from(Buffer.concat(chunks));
};

/** Minimal `tau-slicer-service/1` conformance subset with switchable failure modes. */
type FakeService = {
  server: Server;
  url: string;
  requests: Array<{ method: string; path: string; range?: string; body?: string }>;
  mode: {
    dropAdmissionReply: boolean;
    rejectPlacement: boolean;
    reportedSha256: string;
    holdEvents: boolean;
  };
  cancellations: string[];
  release: () => void;
};

const createFakeService = async (): Promise<FakeService> => {
  const blobs = new Set<string>();
  const jobs = new Map<string, { requestId: string; requestDigest: string }>();
  const requestsById = new Map<string, string>();
  const generation = 'generation-1';
  let pendingRelease: (() => void) | undefined;
  const service: FakeService = {
    server: createServer(),
    url: '',
    requests: [],
    mode: { dropAdmissionReply: false, rejectPlacement: false, reportedSha256: artifactSha256, holdEvents: false },
    cancellations: [],
    release: () => pendingRelease?.(),
  };
  const reply = (response: ServerResponse, status: number, value: unknown): void => {
    response.writeHead(status, { 'content-type': 'application/json', 'x-service-generation': generation });
    response.end(JSON.stringify(value));
  };
  const snapshot = (sliceId: string) => ({
    sliceId,
    requestId: jobs.get(sliceId)!.requestId,
    requestDigest: jobs.get(sliceId)!.requestDigest,
    generation,
    state: 'completed',
    final: {
      artifact: {
        id: 'final-gcode',
        size: artifact.byteLength,
        sha256: service.mode.reportedSha256,
        mediaType: 'text/x.gcode',
        path: `/v1/slices/${sliceId}/artifacts/final-gcode`,
      },
    },
    failure: null,
  });
  service.server.on('request', async (request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    const body = await readBody(request);
    service.requests.push({
      method: request.method!,
      path: url.pathname,
      ...(request.headers.range === undefined ? {} : { range: request.headers.range }),
      ...(body.length === 0 || request.method === 'PUT' ? {} : { body: new TextDecoder().decode(body) }),
    });
    if (request.headers.authorization !== `Bearer ${token}` || request.headers['tau-slicer-protocol'] !== '1') {
      reply(response, 401, { code: 'unauthorized' });
      return;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (request.method === 'PUT' && parts[1] === 'blobs') {
      const digest = parts[2]!;
      if (createHash('sha256').update(body).digest('hex') !== digest) {
        reply(response, 400, { code: 'digest-mismatch' });
        return;
      }
      blobs.add(digest);
      reply(response, 201, { digest, bytes: body.length });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/slices') {
      if (service.mode.rejectPlacement) {
        reply(response, 400, { code: 'invalid-request' });
        return;
      }
      const input = JSON.parse(new TextDecoder().decode(body)) as { requestId: string; inputDigest: string };
      if (!blobs.has(input.inputDigest)) {
        reply(response, 404, { code: 'input-missing' });
        return;
      }
      const existing = requestsById.get(input.requestId);
      if (existing !== undefined) {
        reply(response, 200, snapshot(existing));
        return;
      }
      const sliceId = `slice-${jobs.size + 1}`;
      jobs.set(sliceId, { requestId: input.requestId, requestDigest: 'digest' });
      requestsById.set(input.requestId, sliceId);
      if (service.mode.dropAdmissionReply) {
        service.mode.dropAdmissionReply = false;
        response.destroy();
        return;
      }
      reply(response, 202, snapshot(sliceId));
      return;
    }
    if (request.method === 'GET' && parts[1] === 'requests') {
      const sliceId = requestsById.get(parts[2]!);
      if (sliceId === undefined) {
        reply(response, 404, { code: 'request-unknown-in-generation' });
        return;
      }
      reply(response, 200, snapshot(sliceId));
      return;
    }
    if (parts[1] === 'slices' && parts[2] !== undefined && jobs.has(parts[2])) {
      const sliceId = parts[2];
      if (request.method === 'DELETE') {
        service.cancellations.push(sliceId);
        reply(response, 200, { ...snapshot(sliceId), state: 'cancelled', termination: 'owned-process-exited' });
        return;
      }
      if (request.method === 'GET' && parts.length === 3) {
        reply(response, 200, snapshot(sliceId));
        return;
      }
      if (request.method === 'GET' && parts[3] === 'events') {
        response.writeHead(200, { 'content-type': 'application/x-ndjson', 'x-service-generation': generation });
        response.write(`${JSON.stringify({ type: 'snapshot', snapshot: snapshot(sliceId) })}\n`);
        response.write(`${JSON.stringify({ type: 'started', sliceId, generation })}\n`);
        if (service.mode.holdEvents) {
          await new Promise<void>((resolve) => {
            pendingRelease = resolve;
            request.on('close', resolve);
          });
        }
        response.end(`${JSON.stringify({ type: 'completed', sliceId, generation })}\n`);
        return;
      }
      if (request.method === 'GET' && parts[3] === 'artifacts' && parts[4] === 'final-gcode') {
        const match = /^bytes=(\d+)-(\d+)$/u.exec(request.headers.range ?? '');
        if (!match) {
          reply(response, 416, { code: 'unsupported-range' });
          return;
        }
        const start = Number(match[1]);
        const end = Number(match[2]);
        if (start > end || end >= artifact.byteLength) {
          reply(response, 416, { code: 'invalid-range' });
          return;
        }
        response.writeHead(206, {
          'content-type': 'text/x.gcode',
          'content-range': `bytes ${start}-${end}/${artifact.byteLength}`,
          'accept-ranges': 'bytes',
        });
        response.end(Buffer.from(artifact.subarray(start, end + 1)));
        return;
      }
    }
    reply(response, 404, { code: 'not-found' });
  });
  service.server.listen(0, '127.0.0.1');
  await once(service.server, 'listening');
  const address = service.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('fake service did not bind a TCP port');
  }
  service.url = `http://127.0.0.1:${address.port}`;
  return service;
};

describe('sliceWithService', () => {
  let service: FakeService;
  let mesh: TriangleMesh;

  beforeEach(async () => {
    service = await createFakeService();
    mesh = await readTriangleMesh(Uint8Array.from(readFileSync(join(fixtures, 'cube.glb'))));
  });

  afterEach(async () => {
    service.release();
    service.server.closeAllConnections();
    service.server.close();
    await once(service.server, 'close');
  });

  const options = (url: string) =>
    resolveSlicerOptions(slicerOptionsSchema.parse({ engine: 'service', preset: 'fine', service: { url, token } }));

  it('should upload, place, watch, fetch by ranges and verify the final artifact', async () => {
    const result = await sliceWithService({
      mesh,
      options: { ...options(service.url), service: { url: service.url, token } },
      signal: new AbortController().signal,
    });
    expect(result.gcode).toEqual(artifact);
    expect(result.digest).toBe(`sha256:${artifactSha256}`);
    expect(result).toMatchObject({ sliceId: 'slice-1', generation: 'generation-1' });
    expect(result.requestId).toMatch(/^tau-[a-f0-9]{40}$/u);
    const placement = service.requests.find((request) => request.method === 'POST')!;
    const placed = JSON.parse(placement.body!) as { inputDigest: string };
    expect(placed.inputDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(placed).toEqual({
      requestId: result.requestId,
      inputDigest: placed.inputDigest,
      mode: 'st',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- tau-slicer-service/1 settings field names are fixed.
      settings: { layer_height: 0.12, wall_loops: 2, bed_width: 256, bed_depth: 256, fill_density: 0.15 },
    });
    expect(
      service.requests.map((request) => `${request.method} ${request.path}${request.range ? ` ${request.range}` : ''}`),
    ).toEqual([
      `PUT /v1/blobs/${placed.inputDigest}`,
      'POST /v1/slices',
      'GET /v1/slices/slice-1/events',
      'GET /v1/slices/slice-1',
      `GET /v1/slices/slice-1/artifacts/final-gcode bytes=0-${serviceLimits.rangeBytes - 1}`,
      `GET /v1/slices/slice-1/artifacts/final-gcode bytes=${serviceLimits.rangeBytes}-${artifact.byteLength - 1}`,
    ]);
  });

  it('should resolve a lost admission reply through the retained request id without placing twice', async () => {
    service.mode.dropAdmissionReply = true;
    const result = await sliceWithService({
      mesh,
      options: { ...options(service.url), service: { url: service.url, token } },
      signal: new AbortController().signal,
    });
    expect(result.sliceId).toBe('slice-1');
    const methods = service.requests.map((request) => `${request.method} ${request.path}`);
    expect(methods.filter((entry) => entry === 'POST /v1/slices')).toHaveLength(1);
    expect(methods).toContain(`GET /v1/requests/${result.requestId}`);
  });

  it('should refuse a rejected placement without looking the request up', async () => {
    service.mode.rejectPlacement = true;
    await expect(
      sliceWithService({
        mesh,
        options: { ...options(service.url), service: { url: service.url, token } },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(
      new ServiceEngineError('SERVICE_REQUEST_REJECTED', 'Slice placement returned HTTP 400 (invalid-request).'),
    );
    expect(service.requests.some((request) => request.path.startsWith('/v1/requests/'))).toBe(false);
  });

  it('should refuse an artifact whose bytes do not match the reported digest', async () => {
    service.mode.reportedSha256 = '0'.repeat(64);
    await expect(
      sliceWithService({
        mesh,
        options: { ...options(service.url), service: { url: service.url, token } },
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ name: 'ServiceEngineError', code: 'SERVICE_ARTIFACT_DIGEST_MISMATCH' });
  });

  it('should cancel the owned slice when the caller aborts during observation', async () => {
    service.mode.holdEvents = true;
    const controller = new AbortController();
    const pending = sliceWithService({
      mesh,
      options: { ...options(service.url), service: { url: service.url, token } },
      signal: controller.signal,
    });
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (service.requests.some((request) => request.path.endsWith('/events'))) {
          resolve();
        } else {
          setTimeout(check, 5);
        }
      };
      check();
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(service.cancellations).toEqual(['slice-1']);
  });

  it('should refuse meshes whose STL exceeds the upload bound before contacting the service', async () => {
    const triangleCount = Math.ceil((serviceLimits.uploadBytes - 84) / 50) + 1;
    const oversized: TriangleMesh = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array(triangleCount * 3),
      bounds: { min: [0, 0, 0], max: [1, 1, 0] },
    };
    await expect(
      sliceWithService({
        mesh: oversized,
        options: { ...options(service.url), service: { url: service.url, token } },
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ name: 'ServiceEngineError', code: 'SERVICE_UPLOAD_TOO_LARGE' });
    expect(service.requests).toEqual([]);
  });
});
