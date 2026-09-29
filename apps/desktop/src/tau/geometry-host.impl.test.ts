import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { HostGeoSpecRunner } from '@taucad/host/agent-tools';
import type { UtilityPort } from '#tau/services-host.impl.js';
import { createGeometryHost } from '#tau/geometry-host.impl.js';

describe('geometry utility dispatcher', () => {
  it('runs a diagnostic through the process-local evaluator and preserves its request id', async () => {
    const post = vi.fn();
    const performance = vi.fn(async () => ({ backend: 'native', samples: [1] }));
    const host = createGeometryHost({ post, measure: vi.fn(), performance, createRunner: vi.fn() });
    host.handle({
      data: { type: 'geometry-run', generation: 2, requestId: 4, kind: 'performance', input: { type: 'run', id: 12, input: { engine: 'native-desktop' } } },
      ports: [],
    });
    await vi.waitFor(() => { expect(post).toHaveBeenCalledOnce(); });
    expect(performance).toHaveBeenCalledExactlyOnceWith({ engine: 'native-desktop' });
    expect(post).toHaveBeenCalledWith({
      type: 'geometry-result', generation: 2, requestId: 4,
      value: { id: 12, type: 'result', result: { backend: 'native', samples: [1] } },
    });
  });

  it('never starts a suite canceled while the runner is being created', async () => {
    const deferred = Promise.withResolvers<HostGeoSpecRunner>();
    const port = mock<UtilityPort>();
    const runner = mock<HostGeoSpecRunner>();
    runner.on.mockReturnValue(() => undefined);
    runner.close.mockResolvedValue();
    const post = vi.fn();
    const host = createGeometryHost({
      post,
      measure: vi.fn(),
      performance: vi.fn(),
      createRunner: async () => deferred.promise,
    });
    host.handle({
      data: {
        type: 'geometry-run', generation: 3, requestId: 7, kind: 'suite', root: '/project', engine: 'native',
        runtimeConfig: { tauApiUrl: 'http://localhost', tauWebSocketUrl: 'ws://localhost' },
        input: { type: 'run', options: { files: ['model.test.ts'] } },
      },
      ports: [port],
    });
    host.handle({ data: { type: 'geometry-cancel', generation: 3, requestId: 7 }, ports: [] });
    deferred.resolve(runner);
    await vi.waitFor(() => { expect(runner.close).toHaveBeenCalledOnce(); });
    expect(runner.abort).toHaveBeenCalledOnce();
    expect(runner.run).not.toHaveBeenCalled();
    expect(port.close).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]?.[0]).toMatchObject({
      type: 'geometry-result', generation: 3, requestId: 7,
      value: { type: 'error' },
    });
  });
});
