import { parentPort } from 'node:worker_threads';

import { createSyncFsClient } from '#sync/sync-fs-client.js';
import type { SyncFsProbe } from '#sync/sync-fs-client.js';

type MirrorWorkerMessage = Readonly<{
  port: MessagePort;
  slotSab: SharedArrayBuffer;
  arenaSab: SharedArrayBuffer;
  specifiers: readonly string[];
}>;

/* S13 as a language service runs it, against the worker's index mirror: up to three candidates per specifier, `exists` then the version of a hit, then one probe the index never holds. */
parentPort?.once('message', (message: MirrorWorkerMessage) => {
  const tiers: Record<SyncFsProbe['tier'], number> = { mirror: 0, slot: 0, translation: 0 };
  const client = createSyncFsClient({
    port: message.port,
    slotSab: message.slotSab,
    arenaSab: message.arenaSab,
    workspaceRootAbsolute: '/',
    onProbe: (probe) => {
      tiers[probe.tier] += 1;
    },
  });
  const run = (): void => {
    if (!client.mirrorReady()) {
      setTimeout(run, 1);
      return;
    }
    const startedAt = performance.now();
    let probes = 0;
    let hits = 0;
    const versions: string[] = [];
    for (const specifier of message.specifiers) {
      for (const candidate of [`${specifier}.ts`, `${specifier}.tsx`, `${specifier}/index.ts`]) {
        probes += 1;
        if (client.fileExists(`file:///${candidate}`)) {
          hits += 1;
          versions.push(client.getScriptVersionForPath(`file:///${candidate}`) ?? '');
          break;
        }
      }
    }
    const directory = client.directoryExists('file:///src');
    const duration = performance.now() - startedAt;
    const mirrorTiers = { ...tiers };
    const ignored = client.fileExists('file:///node_modules/dep/index.d.ts');
    parentPort?.postMessage({ duration, probes, hits, versions, directory, mirrorTiers, ignored, tiers });
    client.dispose();
  };
  run();
});
