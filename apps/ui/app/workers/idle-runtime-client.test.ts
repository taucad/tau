// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import { createIdleRuntimeClient } from '#workers/idle-runtime-client.js';

type Document = ReturnType<AppRuntimeClient['open']>;
type Description = Awaited<ReturnType<AppRuntimeClient['describe']>>;

const description = { success: true, kernelId: 'replicad', parameters: {}, issues: [] } as unknown as Description;

const fakeClient = (): AppRuntimeClient => {
  const client = mock<AppRuntimeClient>();
  client.describe.mockResolvedValue(description);
  client.connect.mockResolvedValue();
  client.open.mockImplementation(() => mock<Document>());
  return client;
};

describe('idle runtime client', () => {
  const idleTimeout = 1000;
  let created: AppRuntimeClient[];
  let create: () => AppRuntimeClient;

  beforeEach(() => {
    vi.useFakeTimers();
    created = [];
    create = () => {
      const client = fakeClient();
      created.push(client);
      return client;
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not create a runtime until it is first used', () => {
    createIdleRuntimeClient({ create, idleTimeout });

    expect(created).toHaveLength(0);
  });

  it('should terminate the runtime once it has been idle, and create a fresh one on the next use', async () => {
    const runtime = createIdleRuntimeClient({ create, idleTimeout });

    await runtime.describe({ source: { path: 'main.ts' } });
    await vi.advanceTimersByTimeAsync(idleTimeout - 1);
    expect(created[0]?.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(created[0]?.terminate).toHaveBeenCalledOnce();
    await runtime.describe({ source: { path: 'main.ts' } });
    expect(created).toHaveLength(2);
  });

  it('should keep the runtime while a document is open and arm the idle window when it closes', async () => {
    const runtime = createIdleRuntimeClient({ create, idleTimeout });

    const document = runtime.open({ source: { path: 'main.ts' }, watch: false });
    await vi.advanceTimersByTimeAsync(idleTimeout * 5);
    expect(created[0]?.terminate).not.toHaveBeenCalled();
    document.close();
    document.close();
    await vi.advanceTimersByTimeAsync(idleTimeout);

    expect(created[0]?.terminate).toHaveBeenCalledOnce();
    expect(created).toHaveLength(1);
  });

  it('should keep the runtime while a call is in flight', async () => {
    const runtime = createIdleRuntimeClient({ create, idleTimeout });
    const described = Promise.withResolvers<Description>();

    const pending = runtime.connect();
    vi.mocked(created[0]!.describe).mockReturnValueOnce(described.promise);
    const describing = runtime.describe({ source: { path: 'main.ts' } });
    await pending;
    await vi.advanceTimersByTimeAsync(idleTimeout * 5);
    expect(created[0]?.terminate).not.toHaveBeenCalled();
    described.resolve(description);
    await describing;
    await vi.advanceTimersByTimeAsync(idleTimeout);

    expect(created[0]?.terminate).toHaveBeenCalledOnce();
  });

  it('should read capabilities from the live runtime and stay terminated once terminated', async () => {
    const runtime = createIdleRuntimeClient({ create, idleTimeout });
    expect(runtime.capabilities).toBeUndefined();

    await runtime.connect();
    expect(runtime.capabilities).toBe(created[0]?.capabilities);
    runtime.terminate();

    expect(created[0]?.terminate).toHaveBeenCalledOnce();
    expect(runtime.capabilities).toBeUndefined();
    await vi.advanceTimersByTimeAsync(idleTimeout);
    expect(created[0]?.terminate).toHaveBeenCalledOnce();
    expect(() => runtime.open({ source: { path: 'main.ts' }, watch: false })).toThrow('terminated');
    expect(created).toHaveLength(1);
  });
});
