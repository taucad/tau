/** Exclusive geometry utility entry. Main owns admission, cancellation and exit. */
import { createRuntimeClient } from '@taucad/runtime/client';
import { electronUtilityMainTransport } from '@taucad/runtime/electron/renderer';
import { createHostGeoSpecRunner } from '@taucad/host/agent-tools';
import { queryDirectAp242MinimumDistance } from '@taucad/agent-tools/geospec';
import { Engine } from '@taucad/geospec-engine-native/node';
import type { HostGeoSpecRuntimeClient } from '@taucad/host/agent-tools';
import type { UtilityPort } from '#tau/services-host.impl.js';
import type { createDesktopRuntime } from '#tau/desktop-runtime.factory.js';
import { createGeometryHost } from '#tau/geometry-host.impl.js';
import { runGeoSpecPerformanceInput } from '#tau/geospec-performance.js';

type DesktopRuntime = ReturnType<typeof createDesktopRuntime>;
type ParentPort = {
  on(event: 'message', listener: (message: { data: unknown; ports: readonly UtilityPort[] }) => void): unknown;
  postMessage(message: unknown): void;
};

const { parentPort } = process as unknown as { parentPort?: ParentPort };
if (!parentPort) {
  throw new Error('The Tau geometry host must run inside an Electron utility process.');
}

const host = createGeometryHost({
  post: (message) => {
    parentPort.postMessage(message);
  },
  measure: async (input) => {
    const engine = new Engine();
    try {
      const result = await queryDirectAp242MinimumDistance({
        engine,
        ap242Bytes: input.source.bytes,
        nameA: input.occurrences[0].name,
        nameB: input.occurrences[1].name,
      });
      return { id: input.id, result };
    } finally {
      engine.close();
    }
  },
  performance: runGeoSpecPerformanceInput,
  createRunner: async ({ root, runtimePort, runtimeConfig }) => {
    const client = createRuntimeClient<DesktopRuntime>({
      transport: electronUtilityMainTransport({ port: runtimePort, release: () => undefined }),
      config: runtimeConfig,
    });
    try {
      const runner = await createHostGeoSpecRunner(root, client as unknown as HostGeoSpecRuntimeClient);
      return {
        ...runner,
        async close() {
          try {
            await runner.close();
          } finally {
            client.terminate();
          }
        },
      };
    } catch (error) {
      client.terminate();
      throw error;
    }
  },
});

parentPort.on('message', (message) => {
  host.handle(message);
});
