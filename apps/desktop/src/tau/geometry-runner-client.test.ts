import { MessageChannel } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import { createGeometryRunnerClient } from '#tau/geometry-runner-client.js';
import type { GeoSpecRunnerResult } from 'geospec/runner/worker';

describe('remote GeoSpec runner façade', () => {
  it('replays complete file and run evidence exactly once from the authoritative final result', async () => {
    const { port1, port2 } = new MessageChannel();
    const runner = createGeometryRunnerClient(port1);
    const fileComplete = vi.fn();
    const runComplete = vi.fn();
    runner.on('file-complete', fileComplete);
    runner.on('run-complete', runComplete);
    const result: GeoSpecRunnerResult = {
      success: false,
      passed: 0,
      failed: 1,
      selectedTests: 0,
      files: [
        {
          file: 'model.test.ts',
          durationMs: 12,
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
    port2.once('message', () => {
      port2.postMessage({ type: 'result', result });
      port2.postMessage({ type: 'result', result });
    });
    try {
      await expect(runner.run({ files: ['model.test.ts'] })).resolves.toEqual(result);
      expect(fileComplete).toHaveBeenCalledExactlyOnceWith({ type: 'file-complete', ...result.files[0]! });
      expect(runComplete).toHaveBeenCalledExactlyOnceWith({ type: 'run-complete', result });
    } finally {
      await runner.close();
      port2.close();
    }
  });
  it('should preserve run events and self-contained results over one geometry port', async () => {
    const { port1, port2 } = new MessageChannel();
    const runner = createGeometryRunnerClient(port1);
    const started = vi.fn();
    runner.on('run-start', started);
    port2.on('message', () => {
      port2.postMessage({ type: 'event', event: { type: 'run-start', files: ['model.test.ts'] } });
      port2.postMessage({
        type: 'result',
        result: { success: true, passed: 1, failed: 0, selectedTests: 1, files: [] },
      });
    });
    try {
      await expect(runner.run({ files: ['model.test.ts'] })).resolves.toMatchObject({ success: true, passed: 1 });
      expect(started).toHaveBeenCalledWith({ type: 'run-start', files: ['model.test.ts'] });
      expect(runner).not.toHaveProperty('sourceRevisions');
    } finally {
      await runner.close();
      port2.close();
    }
  });
});
