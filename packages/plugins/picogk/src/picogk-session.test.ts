// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NativeWorkerReportedError } from '@taucad/native-process-core';
import { contentDigest } from '@taucad/cache-core';
import type * as NativeProcessCoreModule from '@taucad/native-process-core';
import { createMockLogger } from '@taucad/runtime-testing';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { PicogkSession, PicogkWorkerError } from '#picogk-session.js';

const sessionMock = vi.hoisted(() => ({
  cleanup: vi.fn(),
  readArtifact: vi.fn(),
  recycle: vi.fn(),
  request: vi.fn(),
  options: undefined as unknown,
}));

vi.mock('@taucad/native-process-core', async (importOriginal) => {
  const actual = await importOriginal<typeof NativeProcessCoreModule>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- this must replace the exact module export.
    NativeProcessSession: class {
      public cleanup = sessionMock.cleanup;
      public readArtifact = sessionMock.readArtifact;
      public recycle = sessionMock.recycle;
      public request = sessionMock.request;

      public constructor(options: unknown) {
        sessionMock.options = options;
      }
    },
  };
});
const issue = { message: 'bad model', code: 'CS1', type: 'syntax', severity: 'error' } as const;
const sceneComponent = {
  id: 'component:picogk-1',
  kind: 'triangles',
  name: 'group-0-object-1',
  color: [1, 1, 1, 1],
  metallic: 0,
  roughness: 0.7,
  positionOffset: 0,
  positionCount: 9,
  normalOffset: 36,
  normalCount: 9,
  indexOffset: 72,
  indexCount: 3,
} as const;
const options = {
  workerExecutable: '/worker',
  workerSha256: 'a'.repeat(64),
  workspacePath: '/workspace',
  artifactPath: '/artifacts',
  trustFile: '/trust',
  resourceFiles: [{ path: '/resource', sha256: 'b'.repeat(64), label: 'resource' }],
  requestTimeout: 100,
  maxArtifactBytes: 200,
  logger: createMockLogger(),
};

describe('PicogkSession', () => {
  it('configures the shared native session and validates protocol frames', async () => {
    const session = new PicogkSession(options);
    const configured = sessionMock.options as {
      readonly parseReady: (value: unknown) => void;
      readonly parseResponse: (value: unknown) => unknown;
      readonly shutdown: { readonly parseResult: (value: unknown) => unknown };
      readonly arguments: readonly string[];
    };
    expect(configured.arguments).toEqual([
      '--workspace',
      '/workspace',
      '--artifacts',
      '/artifacts',
      '--parent-pid',
      String(process.pid),
    ]);
    expect(() => {
      configured.parseReady({ protocolVersion: 3, type: 'ready', dotnetVersion: '10', picogkVersion: '2' });
    }).not.toThrow();
    expect(configured.parseResponse({ protocolVersion: 3, requestId: '1', result: { ok: true } })).toEqual({
      requestId: '1',
      result: { ok: true },
    });
    expect(configured.parseResponse({ protocolVersion: 3, requestId: '2', error: { issues: [issue] } })).toEqual({
      requestId: '2',
      issues: [issue],
    });
    expect(() => configured.parseResponse({ protocolVersion: 3, requestId: '3' })).toThrow(/exactly one/);
    expect(() =>
      configured.parseResponse({ protocolVersion: 3, requestId: '4', result: {}, error: { issues: [issue] } }),
    ).toThrow(/exactly one/);
    expect(configured.shutdown.parseResult({ shutdown: true })).toEqual({ shutdown: true });

    sessionMock.request.mockResolvedValueOnce('value');
    const onEvent = vi.fn();
    await expect(
      session.request({
        method: 'analyze',
        params: {},
        schema: z.literal('value'),
        signal: new AbortController().signal,
        events: { onEvent },
      }),
    ).resolves.toBe('value');
    const request = sessionMock.request.mock.calls.at(-1)?.[0] as {
      parseResult: (value: unknown) => unknown;
      events: { parseEvent: (value: unknown) => unknown; onEvent: (value: unknown) => void };
    };
    const { parseResult } = request;
    expect(parseResult('value')).toBe('value');
    expect(() => parseResult('wrong')).toThrow();
    const event = {
      kind: 'scene',
      mode: 'update',
      operation: 'reset',
      baseSceneGeneration: null,
      sceneGeneration: 1,
      artifact: {
        artifactPath: '/artifacts/frame.tau-mesh',
        byteLength: 84,
        sha256: 'a'.repeat(64),
        components: [sceneComponent],
      },
      removedComponentIds: [],
      presentation: {},
      bookmark: null,
    };
    expect(request.events.parseEvent(event)).toEqual(event);
    const delta = {
      ...event,
      operation: 'delta',
      baseSceneGeneration: 1,
      sceneGeneration: 2,
      artifact: null,
      removedComponentIds: ['component:picogk-1'],
      presentation: null,
    };
    expect(request.events.parseEvent(delta)).toEqual(delta);
    expect(() => request.events.parseEvent({ ...delta, baseSceneGeneration: null })).toThrow();
    expect(() => request.events.parseEvent({ ...event, operation: 'patch' })).toThrow();
    expect(() => request.events.parseEvent({ ...event, artifact: { ...event.artifact, artifactPath: '' } })).toThrow();
    request.events.onEvent(event);
    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it('maps worker issues and delegates artifact/lifecycle operations', async () => {
    const session = new PicogkSession(options);
    const workerError = new PicogkWorkerError([issue]);
    expect(workerError).toMatchObject({ name: 'PicogkWorkerError', message: 'bad model', issues: [issue] });
    sessionMock.request.mockRejectedValueOnce(new NativeWorkerReportedError([issue]));
    await expect(
      session.request({ method: 'build', params: {}, schema: z.object({}), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ name: 'PicogkWorkerError', issues: [issue] });
    sessionMock.request.mockRejectedValueOnce(new Error('transport'));
    await expect(
      session.request({ method: 'build', params: {}, schema: z.object({}), signal: new AbortController().signal }),
    ).rejects.toThrow('transport');

    await session.readArtifact({ artifactPath: '/artifacts/a', byteLength: 1 });
    await session.recycle();
    await session.cleanup();
    expect(sessionMock.readArtifact).toHaveBeenCalledWith({ artifactPath: '/artifacts/a', byteLength: 1 });
    expect(sessionMock.recycle).toHaveBeenCalled();
    expect(sessionMock.cleanup).toHaveBeenCalled();
  });

  it('removes request-scoped progress artifacts when a request fails', async () => {
    const artifactPath = mkdtempSync(join(tmpdir(), 'tau-picogk-session-'));
    const progressRoot = join(artifactPath, 'progress-test');
    const artifact = join(progressRoot, 'frame.tau-mesh');
    mkdirSync(progressRoot);
    writeFileSync(artifact, new Uint8Array([1]));
    try {
      const session = new PicogkSession({ ...options, artifactPath });
      sessionMock.request.mockImplementationOnce(
        async (request: { events: { onEvent: (event: unknown) => void } }): Promise<never> => {
          request.events.onEvent({
            kind: 'scene',
            mode: 'update',
            operation: 'reset',
            artifact: {
              artifactPath: artifact,
              byteLength: 1,
              sha256: 'a'.repeat(64),
              components: [],
              sceneGeneration: 1,
              presentation: {},
              bookmark: null,
            },
          });
          throw new Error('aborted');
        },
      );
      await expect(
        session.request({
          method: 'build',
          params: {},
          schema: z.object({}),
          signal: new AbortController().signal,
          events: { onEvent: vi.fn() },
        }),
      ).rejects.toThrow('aborted');
      expect(existsSync(progressRoot)).toBe(false);
    } finally {
      rmSync(artifactPath, { recursive: true, force: true });
    }
  });

  it('keeps a progress root while the native request may still publish another frame', async () => {
    const artifactPath = mkdtempSync(join(tmpdir(), 'tau-picogk-live-progress-'));
    const progressRoot = join(artifactPath, 'progress-live');
    const artifact = join(progressRoot, 'frame.tau-mesh');
    mkdirSync(progressRoot);
    const eventSent = Promise.withResolvers<void>();
    const finishRequest = Promise.withResolvers<void>();
    const session = new PicogkSession({ ...options, artifactPath });
    sessionMock.readArtifact.mockResolvedValueOnce(new Uint8Array());
    sessionMock.request.mockImplementationOnce(
      async (request: { events: { onEvent: (event: unknown) => void } }): Promise<Record<string, unknown>> => {
        request.events.onEvent({
          kind: 'scene',
          mode: 'operation',
          operation: 'reset',
          artifact: {
            artifactPath: artifact,
            byteLength: 0,
            sha256: 'a'.repeat(64),
            components: [],
            sceneGeneration: 1,
            presentation: {},
            bookmark: null,
          },
        });
        eventSent.resolve();
        await finishRequest.promise;
        return {};
      },
    );
    try {
      const request = session.request({
        method: 'build',
        params: {},
        schema: z.object({}),
        signal: new AbortController().signal,
        events: { onEvent: vi.fn() },
      });
      await eventSent.promise;
      await session.readArtifact({ artifactPath: artifact, byteLength: 0 });
      expect(existsSync(progressRoot)).toBe(true);
      finishRequest.resolve();
      await request;
      expect(existsSync(progressRoot)).toBe(false);
    } finally {
      finishRequest.resolve();
      await session.cleanup();
      rmSync(artifactPath, { recursive: true, force: true });
    }
  });

  it('handles expected progress cleanup races and surfaces an unexpected directory failure', async () => {
    const artifactPath = mkdtempSync(join(tmpdir(), 'tau-picogk-progress-races-'));
    const session = new PicogkSession({ ...options, artifactPath });
    sessionMock.readArtifact.mockResolvedValue(new Uint8Array());
    const registerProgress = async (path: string): Promise<void> => {
      sessionMock.request.mockImplementationOnce(async (request: { events: { onEvent: (event: unknown) => void } }) => {
        request.events.onEvent({
          kind: 'scene',
          mode: 'update',
          operation: 'reset',
          artifact: {
            artifactPath: join(path, 'frame.tau-mesh'),
            byteLength: 0,
            sha256: 'a'.repeat(64),
            components: [],
            sceneGeneration: 1,
            presentation: {},
            bookmark: null,
          },
        });
        return {};
      });
      await session.request({
        method: 'build',
        params: {},
        schema: z.object({}),
        signal: new AbortController().signal,
        events: { onEvent: vi.fn() },
      });
    };
    try {
      const nonempty = join(artifactPath, 'progress-nonempty');
      mkdirSync(nonempty);
      writeFileSync(join(nonempty, 'retained'), 'retained');
      await registerProgress(nonempty);
      await expect(
        session.readArtifact({ artifactPath: join(nonempty, 'frame.tau-mesh'), byteLength: 0 }),
      ).resolves.toEqual(new Uint8Array());

      const missing = join(artifactPath, 'progress-missing');
      await registerProgress(missing);
      await expect(
        session.readArtifact({ artifactPath: join(missing, 'frame.tau-mesh'), byteLength: 0 }),
      ).resolves.toEqual(new Uint8Array());

      const notDirectory = join(artifactPath, 'progress-file');
      writeFileSync(notDirectory, 'not a directory');
      await registerProgress(notDirectory);
      await expect(
        session.readArtifact({ artifactPath: join(notDirectory, 'frame.tau-mesh'), byteLength: 0 }),
      ).rejects.toBeDefined();
    } finally {
      await session.cleanup();
      rmSync(artifactPath, { recursive: true, force: true });
    }
  });

  it('materializes one immutable compute blob once and reuses it across worker generations', async () => {
    const artifactPath = mkdtempSync(join(tmpdir(), 'tau-picogk-compute-'));
    try {
      const session = new PicogkSession({ ...options, artifactPath });
      const entry = {
        identity: { cacheKey: '1:voxels', kind: 'triangles', positionCount: 3, indexCount: 3 } as const,
        bytes: new Uint8Array([1, 2, 3]),
        contentDigest: contentDigest({ value: `sha256:${'c'.repeat(64)}` }),
      };
      const first = await session.prehydrateCompute([entry]);
      entry.bytes[0] = 9;
      const second = await session.prehydrateCompute([{ ...entry, bytes: new Uint8Array([1, 2, 3]) }]);
      expect(first).toEqual(second);
      expect(readFileSync(first[0]!.artifactPath)).toEqual(Buffer.from([1, 2, 3]));
      await session.recycle();
      expect(readFileSync(second[0]!.artifactPath)).toEqual(Buffer.from([1, 2, 3]));
      await session.cleanup();
      expect(existsSync(join(artifactPath, 'compute-inputs'))).toBe(false);
    } finally {
      rmSync(artifactPath, { recursive: true, force: true });
    }
  });

  it('validates pre-existing compute blobs and propagates staging filesystem failures', async () => {
    const artifactPath = mkdtempSync(join(tmpdir(), 'tau-picogk-compute-races-'));
    const digest = contentDigest({ value: `sha256:${'d'.repeat(64)}` });
    const entry = {
      identity: { cacheKey: '1:mesh', kind: 'triangles', positionCount: 3, indexCount: 3 } as const,
      bytes: new Uint8Array([1, 2, 3]),
      contentDigest: digest,
    };
    const stagedRoot = join(artifactPath, 'compute-inputs');
    const stagedPath = join(stagedRoot, digest.slice('sha256:'.length));
    mkdirSync(stagedRoot);
    writeFileSync(stagedPath, entry.bytes);
    try {
      const matching = new PicogkSession({ ...options, artifactPath });
      await expect(matching.prehydrateCompute([entry])).resolves.toEqual([
        expect.objectContaining({ artifactPath: stagedPath, sha256: 'd'.repeat(64) }),
      ]);

      const mismatching = new PicogkSession({ ...options, artifactPath });
      await expect(mismatching.prehydrateCompute([{ ...entry, bytes: new Uint8Array([9, 9, 9]) }])).rejects.toThrow(
        'PicoGK compute input changed unexpectedly.',
      );

      const unstableArtifactPath = join(artifactPath, 'unstable');
      const unstable = new PicogkSession({ ...options, artifactPath: unstableArtifactPath });
      const unstableEntry = {
        identity: entry.identity,
        get bytes(): Uint8Array<ArrayBuffer> {
          rmSync(join(unstableArtifactPath, 'compute-inputs'), { recursive: true, force: true });
          return new Uint8Array([1, 2, 3]);
        },
        contentDigest: digest,
      };
      await expect(unstable.prehydrateCompute([unstableEntry])).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      rmSync(artifactPath, { recursive: true, force: true });
    }
  });
});
