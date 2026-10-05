import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { HostGeoSpecRunner } from '@taucad/host/agent-tools';
import type { GeoSpecRunnerEvent, GeoSpecRunnerResult } from 'geospec/runner/worker';
import type { UtilityPort } from '#tau/services-host.impl.js';
import { createGeometryHost } from '#tau/geometry-host.impl.js';

describe('geometry utility dispatcher', () => {
  it('sends complete reports once through the final-result boundary, not progress', async () => {
    const result: GeoSpecRunnerResult = {
      success: false,
      passed: 0,
      failed: 1,
      selectedTests: 0,
      files: [
        {
          file: 'model.test.ts',
          result: {
            success: false,
            issues: [],
            bundle: {
              code: 'x'.repeat(70_000),
              issues: [],
              success: true,
              dependencies: ['model.test.ts'],
              unresolvedPaths: [],
            },
          },
        },
      ],
    };
    const listeners = new Set<(event: GeoSpecRunnerEvent) => void>();
    const runner = mock<HostGeoSpecRunner>();
    runner.on.mockImplementation((type, handler) => {
      const listener = (event: GeoSpecRunnerEvent): void => {
        if (event.type === type) {
          handler(event);
        }
      };
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    });
    runner.run.mockImplementation(async () => {
      for (const event of [
        { type: 'file-start', file: 'model.test.ts' },
        { type: 'file-complete', ...result.files[0]! },
        { type: 'run-complete', result },
      ] satisfies GeoSpecRunnerEvent[]) {
        for (const listener of listeners) {
          listener(event);
        }
      }
      return result;
    });
    const post = vi.fn<(frame: unknown) => void>();
    const host = createGeometryHost({ post, measure: vi.fn(), performance: vi.fn(), createRunner: async () => runner });
    host.handle({
      data: {
        type: 'geometry-run',
        generation: 1,
        requestId: 1,
        kind: 'suite',
        root: '/project',
        runtimeConfig: { tauApiUrl: 'http://localhost', tauWebSocketUrl: 'ws://localhost' },
        input: { type: 'run', options: { files: ['model.test.ts'] } },
      },
      ports: [mock<UtilityPort>()],
    });
    await vi.waitFor(() => {
      expect(runner.close).toHaveBeenCalledOnce();
    });
    const frames = post.mock.calls.map(([frame]) => frame);
    const progress = frames.filter(
      (frame) => frame !== null && typeof frame === 'object' && 'type' in frame && frame.type === 'geometry-event',
    );
    expect(progress.every((frame) => Buffer.byteLength(JSON.stringify(frame)) <= 64 * 1024)).toBe(true);
    expect(progress).toEqual([
      { type: 'geometry-event', generation: 1, requestId: 1, event: { type: 'file-start', file: 'model.test.ts' } },
      {
        type: 'geometry-event',
        generation: 1,
        requestId: 1,
        event: { type: 'file-progress', file: 'model.test.ts', durationMs: undefined },
      },
    ]);
    expect(
      frames.filter(
        (frame) => frame !== null && typeof frame === 'object' && 'type' in frame && frame.type === 'geometry-result',
      ),
    ).toEqual([{ type: 'geometry-result', generation: 1, requestId: 1, value: { type: 'result', result } }]);
    expect(listeners.size).toBe(0);
  });
  it('runs a diagnostic through the process-local evaluator and preserves its request id', async () => {
    const post = vi.fn();
    const performance = vi.fn(async () => ({ backend: 'native', samples: [1] }));
    const host = createGeometryHost({ post, measure: vi.fn(), performance, createRunner: vi.fn() });
    host.handle({
      data: {
        type: 'geometry-run',
        generation: 2,
        requestId: 4,
        kind: 'performance',
        input: { type: 'run', id: 12, input: { engine: 'native-desktop' } },
      },
      ports: [],
    });
    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledOnce();
    });
    expect(performance).toHaveBeenCalledExactlyOnceWith({ engine: 'native-desktop' });
    expect(post).toHaveBeenCalledWith({
      type: 'geometry-result',
      generation: 2,
      requestId: 4,
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
        type: 'geometry-run',
        generation: 3,
        requestId: 7,
        kind: 'suite',
        root: '/project',
        runtimeConfig: { tauApiUrl: 'http://localhost', tauWebSocketUrl: 'ws://localhost' },
        input: { type: 'run', options: { files: ['model.test.ts'] } },
      },
      ports: [port],
    });
    host.handle({ data: { type: 'geometry-cancel', generation: 3, requestId: 7 }, ports: [] });
    deferred.resolve(runner);
    await vi.waitFor(() => {
      expect(runner.close).toHaveBeenCalledOnce();
    });
    expect(runner.abort).toHaveBeenCalledOnce();
    expect(runner.run).not.toHaveBeenCalled();
    expect(port.close).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]?.[0]).toMatchObject({
      type: 'geometry-result',
      generation: 3,
      requestId: 7,
      value: { type: 'error' },
    });
  });
  it('keeps a large suite result while forwarding only bounded lifecycle events', async () => {
    const fileResult: GeoSpecRunnerResult['files'][number]['result'] = {
      success: true,
      passed: true,
      tests: [],
      bundle: { success: true, code: 'x'.repeat(70_000), issues: [], dependencies: [], unresolvedPaths: [] },
    };
    const result: GeoSpecRunnerResult = {
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
      files: [{ file: 'model.geospec.ts', result: fileResult }],
    };
    const completedFile = {
      type: 'file-complete',
      file: 'model.geospec.ts',
      result: fileResult,
      durationMs: 1,
    } as const;
    const completedRun = { type: 'run-complete', result } as const;
    expect(Buffer.byteLength(JSON.stringify(completedFile))).toBeGreaterThan(64 * 1024);
    expect(Buffer.byteLength(JSON.stringify(completedRun))).toBeGreaterThan(64 * 1024);

    const port = mock<UtilityPort>();
    const runner = mock<HostGeoSpecRunner>();
    runner.on.mockReturnValue(() => undefined);
    runner.close.mockResolvedValue();
    const emit = <Type extends GeoSpecRunnerEvent['type']>(
      type: Type,
      event: Extract<GeoSpecRunnerEvent, { type: Type }>,
    ): void => {
      for (const [registered, handler] of runner.on.mock.calls) {
        if (registered === type) {
          // The registered discriminant matches the emitted event at this call site.
          (handler as (value: typeof event) => void)(event);
        }
      }
    };
    runner.run.mockImplementation(async () => {
      emit('run-start', { type: 'run-start', files: ['model.geospec.ts'] });
      emit('file-complete', completedFile);
      emit('run-complete', completedRun);
      emit('forensic', { type: 'forensic', name: 'selected', value: 1, unit: 'count' });
      return result;
    });
    const post = vi.fn();
    const host = createGeometryHost({ post, measure: vi.fn(), performance: vi.fn(), createRunner: async () => runner });
    host.handle({
      data: {
        type: 'geometry-run',
        generation: 4,
        requestId: 8,
        kind: 'suite',
        root: '/project',
        runtimeConfig: { tauApiUrl: 'http://localhost', tauWebSocketUrl: 'ws://localhost' },
        input: { type: 'run', options: { files: ['model.geospec.ts'] } },
      },
      ports: [port],
    });
    await vi.waitFor(() => {
      expect(runner.close).toHaveBeenCalledOnce();
    });
    expect(post.mock.calls).toStrictEqual([
      [
        {
          type: 'geometry-event',
          generation: 4,
          requestId: 8,
          event: { type: 'run-start', files: ['model.geospec.ts'] },
        },
      ],
      [
        {
          type: 'geometry-event',
          generation: 4,
          requestId: 8,
          event: { type: 'file-progress', file: completedFile.file, durationMs: completedFile.durationMs },
        },
      ],
      [
        {
          type: 'geometry-event',
          generation: 4,
          requestId: 8,
          event: { type: 'forensic', name: 'selected', value: 1, unit: 'count' },
        },
      ],
      [
        {
          type: 'geometry-result',
          generation: 4,
          requestId: 8,
          value: { type: 'result', result, sourceRevisions: [] },
        },
      ],
    ]);
    expect(port.close).toHaveBeenCalledOnce();
  });
});
