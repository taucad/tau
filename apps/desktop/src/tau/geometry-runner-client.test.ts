import { MessageChannel } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import { createGeometryRunnerClient } from '#tau/geometry-runner-client.js';

describe('remote GeoSpec runner façade', () => {
  it('preserves run events and source revisions over one geometry port', async () => {
    const { port1, port2 } = new MessageChannel();
    const runner = createGeometryRunnerClient(port1);
    const started = vi.fn();
    runner.on('run-start', started);
    port2.on('message', () => {
      port2.postMessage({ type: 'event', event: { type: 'run-start', files: ['model.test.ts'] } });
      port2.postMessage({
        type: 'result',
        result: { success: true, passed: 1, failed: 0, selectedTests: 1, files: [] },
        sourceRevisions: [],
      });
    });
    try {
      await expect(runner.run({ files: ['model.test.ts'] })).resolves.toMatchObject({ success: true, passed: 1 });
      expect(started).toHaveBeenCalledWith({ type: 'run-start', files: ['model.test.ts'] });
      expect(runner.sourceRevisions?.()).toEqual([]);
    } finally {
      await runner.close();
      port2.close();
    }
  });
});
