import { parentPort } from 'node:worker_threads';

import type { SyncFsProbe } from '#sync/sync-fs-client.js';
import { createSyncFsClient } from '#sync/sync-fs-client.js';

type SabDecodeWorkerMessage = Readonly<{
  port: MessagePort;
  slotSab: SharedArrayBuffer;
  arenaSab: SharedArrayBuffer;
  workspaceRootAbsolute: string;
}>;

parentPort?.once('message', (message: SabDecodeWorkerMessage) => {
  const probes: SyncFsProbe[] = [];
  const client = createSyncFsClient({
    port: message.port,
    slotSab: message.slotSab,
    arenaSab: message.arenaSab,
    workspaceRootAbsolute: message.workspaceRootAbsolute,
    onProbe: (probe) => {
      probes.push(probe);
    },
  });

  const text = client.readFileText('file:///lib/a.ts');
  const version = client.getScriptVersionForPath('file:///lib/a.ts');
  const directories = client.getDirectories('file:///lib');

  parentPort?.postMessage({ text, version, directories, probes });
});
