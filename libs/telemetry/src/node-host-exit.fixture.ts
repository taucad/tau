/**
 * A short-lived Node host that records one entry and awaits `shutdown()` while its identity read is still pending on
 * an unreferenced timer, as `tau prepare` and `tau export` do. It must exit 0 after the bound, never 13 (an unsettled
 * top-level await when the event loop drains).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { toRuntimeEntry } from '#client.js';
import { createNodeHostTelemetry } from '#node-host.js';

const telemetry = createNodeHostTelemetry({
  route: 'cli',
  release: '1.0.0',
  apiOrigin: 'https://api.test',
  configDir: mkdtempSync(path.join(tmpdir(), 'tau-telemetry-exit-')),
  env: {},
  cloudBuild: false,
  readIdentity: async () =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve({ kind: 'signed-out' });
      }, 60_000).unref();
    }),
  platform: 'linux',
  fetch: async () => {
    throw new TypeError('fetch failed');
  },
});
telemetry.startIdentityBootstrap();
telemetry.record(
  toRuntimeEntry(
    {
      operation: 'export',
      kernel: 'replicad',
      outcome: { type: 'succeeded' },
      transport: 'node-worker',
      adaptations: [],
      limit: undefined,
      format: 'stl',
      plugin: undefined,
      duration: 1,
      worker: undefined,
      facts: 'none',
    },
    telemetry.context('host'),
  ),
);
await telemetry.shutdown();
process.stdout.write('shutdown-returned\n');
