// @vitest-environment node
import { NativeWorkerReportedError } from '@taucad/native-process-core';
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
      configured.parseReady({ protocolVersion: 1, type: 'ready', dotnetVersion: '10', picogkVersion: '2' });
    }).not.toThrow();
    expect(configured.parseResponse({ protocolVersion: 1, requestId: '1', result: { ok: true } })).toEqual({
      requestId: '1',
      result: { ok: true },
    });
    expect(configured.parseResponse({ protocolVersion: 1, requestId: '2', error: { issues: [issue] } })).toEqual({
      requestId: '2',
      issues: [issue],
    });
    expect(() => configured.parseResponse({ protocolVersion: 1, requestId: '3' })).toThrow(/exactly one/);
    expect(() =>
      configured.parseResponse({ protocolVersion: 1, requestId: '4', result: {}, error: { issues: [issue] } }),
    ).toThrow(/exactly one/);
    expect(configured.shutdown.parseResult({ shutdown: true })).toEqual({ shutdown: true });

    sessionMock.request.mockResolvedValueOnce('value');
    await expect(
      session.request({
        method: 'analyze',
        params: {},
        schema: z.literal('value'),
        signal: new AbortController().signal,
      }),
    ).resolves.toBe('value');
    const parseResult = sessionMock.request.mock.calls.at(-1)?.[0].parseResult as (value: unknown) => unknown;
    expect(parseResult('value')).toBe('value');
    expect(() => parseResult('wrong')).toThrow();
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
});
