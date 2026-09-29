import { MessageChannel } from 'node:worker_threads';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { serveGeoSpecPerformance } from '#tau/geospec-performance.js';

const lab = vi.hoisted(() => {
  const construct = vi.fn();
  return {
    parse: vi.fn(),
    run: vi.fn(),
    construct,
    native: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Mock of the native module export.
      Engine: class {
        public constructor(...args: unknown[]) {
          construct(...args);
        }

        public close(): void {
          /* The mock exposes the native engine lifecycle. */
        }
      },
      canonicalize: vi.fn(),
    },
  };
});
vi.mock('../../../../packages/geospec-engine/experiments/performance-lab/performance-lab-runner.js', () => ({
  parsePerformanceLabRunInput: lab.parse,
  runPerformanceLabCell: lab.run,
}));
vi.mock('@taucad/geospec-engine-native/node', () => lab.native);

describe('desktop GeoSpec performance concern', () => {
  it('should pass fixture bytes to the shared runner and load the native module', async () => {
    const { port1, port2 } = new MessageChannel();
    const input = {
      engine: 'native-desktop',
      fixture: { bytes: new Uint8Array([1, 2, 3]) },
      cases: [],
    };
    const result = { backend: 'native', perCase: [{ status: 'passed' }] };
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    lab.parse.mockResolvedValue(input);
    lab.run.mockImplementation(
      async (
        actual: unknown,
        modules: {
          native(): Promise<{ Engine: new (...args: unknown[]) => unknown; canonicalize: unknown }>;
        },
      ) => {
        expect(actual).toEqual({ ...input, cache: 'host-module-cache' });
        const native = await modules.native();
        expect(native.canonicalize).toBe(lab.native.canonicalize);
        const engine = new native.Engine({ variant: 'st' });
        expect(engine).toBeDefined();
        expect(lab.construct).toHaveBeenCalledExactlyOnceWith();
        started.resolve();
        await finish.promise;
        return result;
      },
    );
    const close = serveGeoSpecPerformance(port1);
    try {
      const reply = once(port2, 'message');
      port2.postMessage({ id: 7, type: 'run', input });
      await started.promise;
      const drained = close();
      finish.resolve();
      await expect(reply).resolves.toEqual([{ id: 7, type: 'result', result }]);
      await drained;
      expect(lab.parse).toHaveBeenCalledExactlyOnceWith(input);
      expect(lab.run).toHaveBeenCalledOnce();
    } finally {
      finish.resolve();
      await close();
      port2.close();
    }
  });
});
