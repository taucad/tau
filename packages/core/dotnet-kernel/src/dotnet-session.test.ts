// @vitest-environment node
import { NativeWorkerReportedError } from '@taucad/native-process-core';
import type * as NativeProcessCoreModule from '@taucad/native-process-core';
import { createMockLogger } from '@taucad/runtime-testing';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createDotnetSession } from '#dotnet-session.js';
import type { DotnetWorker } from '#dotnet-session.js';

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

const issueSchema = z.object({ message: z.string(), code: z.string() });
type Issue = z.infer<typeof issueSchema>;

class SampleWorkerError extends Error {
  public readonly issues: Issue[];

  public constructor(issues: Issue[]) {
    super(issues.map(({ message }) => message).join('; '));
    this.issues = issues;
    this.name = 'SampleWorkerError';
  }
}

const worker: DotnetWorker<Issue> = {
  sessionName: 'Sample C#',
  executableName: 'Sample C# worker',
  protocolVersion: 3,
  readySchema: z.object({ protocolVersion: z.literal(3), type: z.literal('ready') }),
  responseSchema: z.object({
    protocolVersion: z.literal(3),
    requestId: z.string(),
    result: z.unknown().optional(),
    error: z.object({ issues: z.array(issueSchema).min(1) }).optional(),
  }),
  issueSchema,
  shutdownSchema: z.object({ shutdown: z.literal(true) }),
  maxProtocolLineBytes: 4096,
  workerError: (issues) => new SampleWorkerError(issues),
};
const issue: Issue = { message: 'bad model', code: 'CS1' };
const options = {
  workerExecutable: '/runtime/worker',
  workerSha256: 'a'.repeat(64),
  workspacePath: '/workspace',
  artifactPath: '/artifacts',
  resourceFiles: [{ path: '/runtime/resource', sha256: 'b'.repeat(64), label: 'resource' }],
  requestTimeout: 100,
  maxArtifactBytes: 200,
  logger: createMockLogger(),
};
const workerArguments = ['--workspace', '/workspace', '--artifacts', '/artifacts', '--parent-pid', String(process.pid)];

type ConfiguredSession = {
  readonly parseReady: (value: unknown) => void;
  readonly parseResponse: (value: unknown) => unknown;
  readonly shutdown: { readonly method: string; readonly parseResult: (value: unknown) => unknown };
};

describe('createDotnetSession', () => {
  it("should configure the native session with the worker's names, protocol and line bound", () => {
    createDotnetSession(worker, options);

    expect(sessionMock.options).toMatchObject({
      executablePath: '/runtime/worker',
      executableSha256: 'a'.repeat(64),
      arguments: workerArguments,
      runtimePath: '/runtime',
      resources: options.resourceFiles,
      protocolVersion: 3,
      maxProtocolLineBytes: 4096,
      sessionName: 'Sample C#',
      executableName: 'Sample C# worker',
    });
    const configured = sessionMock.options as ConfiguredSession;
    expect(() => {
      configured.parseReady({ protocolVersion: 3, type: 'ready' });
    }).not.toThrow();
    expect(() => {
      configured.parseReady({ protocolVersion: 2, type: 'ready' });
    }).toThrow();
    expect(configured.shutdown.method).toBe('shutdown');
    expect(configured.shutdown.parseResult({ shutdown: true })).toEqual({ shutdown: true });
  });

  it('should accept a response with exactly one of result or error', () => {
    createDotnetSession(worker, options);
    const { parseResponse } = sessionMock.options as ConfiguredSession;

    expect(parseResponse({ protocolVersion: 3, requestId: '1', result: { ok: true } })).toEqual({
      requestId: '1',
      result: { ok: true },
    });
    expect(parseResponse({ protocolVersion: 3, requestId: '2', error: { issues: [issue] } })).toEqual({
      requestId: '2',
      issues: [issue],
    });
    expect(() => parseResponse({ protocolVersion: 3, requestId: '3' })).toThrow(/exactly one/u);
    expect(() => parseResponse({ protocolVersion: 3, requestId: '4', result: {}, error: { issues: [issue] } })).toThrow(
      /exactly one/u,
    );
  });

  it('should run the worker assembly through the muxer under the closure root', () => {
    createDotnetSession(worker, {
      ...options,
      workerExecutable: '/closure/dotnet/dotnet',
      workerArguments: ['/closure/tau-worker/Tau.Sample.Worker.dll'],
      runtimePath: '/closure',
    });

    expect(sessionMock.options).toMatchObject({
      runtimePath: '/closure',
      arguments: ['/closure/tau-worker/Tau.Sample.Worker.dll', ...workerArguments],
    });
  });

  it("should validate results, map reported issues to the worker's error and delegate the lifecycle", async () => {
    const session = createDotnetSession(worker, options);
    const { signal } = new AbortController();

    sessionMock.request.mockResolvedValueOnce('value');
    await expect(session.request({ method: 'analyze', params: {}, schema: z.literal('value'), signal })).resolves.toBe(
      'value',
    );
    const request = sessionMock.request.mock.calls.at(-1)?.[0] as { parseResult: (value: unknown) => unknown };
    expect(() => request.parseResult('wrong')).toThrow();

    sessionMock.request.mockRejectedValueOnce(new NativeWorkerReportedError([issue]));
    await expect(session.request({ method: 'build', params: {}, schema: z.object({}), signal })).rejects.toMatchObject({
      name: 'SampleWorkerError',
      issues: [issue],
    });
    sessionMock.request.mockRejectedValueOnce(new Error('transport'));
    await expect(session.request({ method: 'build', params: {}, schema: z.object({}), signal })).rejects.toThrow(
      'transport',
    );

    await session.readArtifact({ artifactPath: '/artifacts/a', byteLength: 1 });
    await session.recycle();
    await session.cleanup();
    expect(sessionMock.readArtifact).toHaveBeenCalledWith({ artifactPath: '/artifacts/a', byteLength: 1 });
    expect(sessionMock.recycle).toHaveBeenCalled();
    expect(sessionMock.cleanup).toHaveBeenCalled();
  });
});
