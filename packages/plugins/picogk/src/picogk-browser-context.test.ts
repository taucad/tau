import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createPicogkBrowserContext } from '#picogk-browser-context.js';
import { PicogkBrowserSession } from '#picogk-browser-session.js';

const artifact = () => ({ artifactPath: '/artifacts/model.tau-mesh', byteLength: 0, sha256: 'a'.repeat(64) });
const setup = () => {
  const services = { ...createMockKernelRuntime({ filesystemOverrides: { readFileResult: 'code' } }), operationId: 1 };
  services.filesystem.mocks.readdirStat.mockResolvedValue([
    { name: 'main.cs', path: 'main.cs', type: 'file', size: 4, mtimeMs: 0 },
  ]);
  const context = createPicogkBrowserContext({
    createWorker: () => {
      throw new Error('Unexpected worker dispatch');
    },
    startupTimeout: 1000,
    requestTimeout: 1000,
    assets: {
      bootstrapUrl: 'https://example.test/dotnet.js',
      compilerIdentity: '0'.repeat(64),
      references: [],
      runtimeFiles: [],
    },
  });
  const request = async () =>
    context.session.request({
      operationId: services.operationId,
      signal: services.signal,
      method: 'build',
      params: {},
      schema: z.object({ artifactPath: z.string(), byteLength: z.number(), sha256: z.string() }),
    });
  return { context, services, request };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PicoGK browser kernel context', () => {
  it('should snapshot once per operation and refresh edited contents for the next operation', async () => {
    const { context, services } = setup();
    await expect(context.mirror.sync(services)).resolves.toEqual(['main.cs']);
    await context.mirror.sync(services);
    expect(services.filesystem.mocks.readFile).toHaveBeenCalledOnce();
    await context.mirror.sync({ ...services, operationId: 2 });
    expect(services.filesystem.mocks.readFile).toHaveBeenCalledTimes(2);
    await expect(context.session.sampleResident()).resolves.toBeUndefined();
    await context.session.cleanup();
    await expect(context.mirror.sync(services)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('should observe the heap of the session it holds now, not the one it recycled', async () => {
    const { context } = setup();
    const observed = vi.spyOn(PicogkBrowserSession.prototype, 'observedHeapBytes').mockReturnValueOnce(64 * 2 ** 20);
    expect(context.session.observedHeapBytes?.()).toBe(64 * 2 ** 20);
    await context.session.recycle();
    expect(context.session.observedHeapBytes?.()).toBeUndefined();
    expect(observed).toHaveBeenCalledTimes(2);
    expect(observed.mock.contexts[1]).not.toBe(observed.mock.contexts[0]);
    await context.session.cleanup();
  });

  it('should reject unsynchronized, cancelled and superseded requests before dispatch', async () => {
    const { context, services, request } = setup();
    const dispatch = vi.spyOn(PicogkBrowserSession.prototype, 'request');
    await expect(request()).rejects.toMatchObject({ name: 'AbortError' });
    await context.mirror.sync({ ...services, operationId: 2 });
    await expect(request()).rejects.toMatchObject({ name: 'AbortError' });
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(context.mirror.sync({ ...services, signal: cancelled.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(dispatch).not.toHaveBeenCalled();
    await context.session.cleanup();
  });

  it('should reject a snapshot completed after a newer operation or disposal', async () => {
    const { context, services } = setup();
    const pending = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    services.filesystem.mocks.readFile.mockReturnValueOnce(pending.promise);
    const old = context.mirror.sync(services);
    const rejection = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await context.mirror.sync({ ...services, operationId: 2 });
    pending.resolve(new TextEncoder().encode('code'));
    await rejection;
    await context.mirror.cleanup();
    await expect(context.mirror.sync(services)).rejects.toMatchObject({ name: 'AbortError' });
    await context.session.cleanup();
  });

  it('should admit only the exact build receipt once and reject it after recycling', async () => {
    const { context, services, request } = setup();
    vi.spyOn(PicogkBrowserSession.prototype, 'request').mockResolvedValue(artifact());
    const read = vi.spyOn(PicogkBrowserSession.prototype, 'readArtifact').mockResolvedValue(new Uint8Array());
    await context.mirror.sync(services);
    const result = await request();
    await expect(context.session.readArtifact({ ...result })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(context.session.readArtifact(result)).resolves.toEqual(new Uint8Array());
    await expect(context.session.readArtifact(result)).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).toHaveBeenCalledOnce();
    const next = await request();
    await context.session.recycle();
    await expect(context.session.readArtifact(next)).rejects.toMatchObject({ name: 'AbortError' });
    await context.session.cleanup();
  });

  it('should own each authored receipt independently and reject stale or copied receipts', async () => {
    const { context, services, request } = setup();
    const output = { ...artifact(), artifactPath: '/artifacts/authored/first/files/part.stl' };
    vi.spyOn(PicogkBrowserSession.prototype, 'request').mockResolvedValue({
      ...artifact(),
      authoredOutputs: [output, null],
    });
    vi.spyOn(PicogkBrowserSession.prototype, 'readArtifact').mockResolvedValue(new Uint8Array());
    await context.mirror.sync(services);
    const build = await request();
    await context.session.readArtifact(build);
    await expect(context.session.readArtifact({ ...output })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(context.session.readArtifact(output)).resolves.toEqual(new Uint8Array());
    await request();
    await context.mirror.sync({ ...services, operationId: 2 });
    await expect(context.session.readArtifact(output)).rejects.toMatchObject({ name: 'AbortError' });
    await context.session.cleanup();
  });

  it('should reject build completion superseded while the worker was running', async () => {
    const { context, services, request } = setup();
    const pending = Promise.withResolvers<ReturnType<typeof artifact>>();
    vi.spyOn(PicogkBrowserSession.prototype, 'request').mockReturnValue(pending.promise);
    await context.mirror.sync(services);
    const old = request();
    const rejection = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await context.mirror.sync({ ...services, operationId: 2 });
    pending.resolve(artifact());
    await rejection;
    await context.session.cleanup();
  });

  it('should reject artifact completion superseded during transfer', async () => {
    const { context, services, request } = setup();
    vi.spyOn(PicogkBrowserSession.prototype, 'request').mockResolvedValue(artifact());
    const pending = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    vi.spyOn(PicogkBrowserSession.prototype, 'readArtifact').mockReturnValue(pending.promise);
    await context.mirror.sync(services);
    const result = await request();
    const read = context.session.readArtifact(result);
    const rejection = expect(read).rejects.toMatchObject({ name: 'AbortError' });
    await context.mirror.sync({ ...services, operationId: 2 });
    pending.resolve(new Uint8Array());
    await rejection;
    await context.session.cleanup();
  });
  it.each(['recycle', 'cleanup'] as const)('should reject a build completed after session %s', async (action) => {
    const { context, services, request } = setup();
    const pending = Promise.withResolvers<ReturnType<typeof artifact>>();
    const started = Promise.withResolvers<void>();
    vi.spyOn(PicogkBrowserSession.prototype, 'request').mockImplementation(async () => {
      started.resolve();
      return pending.promise;
    });
    await context.mirror.sync(services);
    const old = request();
    const rejection = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    await context.session[action]();
    pending.resolve(artifact());
    await rejection;
    await context.session.cleanup();
  });
  it.each([
    { method: 'analyze', value: {} },
    { method: 'build', value: null },
    { method: 'build', value: 7 },
  ])('should return generic $method results without artifact ownership', async ({ method, value }) => {
    const { context, services } = setup();
    vi.spyOn(PicogkBrowserSession.prototype, 'request').mockResolvedValue(value);
    await context.mirror.sync(services);
    await expect(
      context.session.request({ operationId: 1, signal: services.signal, method, params: {}, schema: z.unknown() }),
    ).resolves.toEqual(value);
    await expect(context.session.readArtifact(artifact())).rejects.toMatchObject({ name: 'AbortError' });
    await context.session.cleanup();
  });
});
