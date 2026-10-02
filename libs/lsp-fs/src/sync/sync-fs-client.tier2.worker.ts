import { parentPort, workerData } from 'node:worker_threads';

import { createSyncFsClient } from '#sync/sync-fs-client.js';

type Tier2WorkerMessage = Readonly<{
  port: MessagePort;
  slotSab: SharedArrayBuffer;
  arenaSab: SharedArrayBuffer;
  filePoolBuffer?: SharedArrayBuffer;
}>;

parentPort?.once('message', (message: Tier2WorkerMessage) => {
  const client = createSyncFsClient({
    port: message.port,
    slotSab: message.slotSab,
    arenaSab: message.arenaSab,
    filePoolBuffer: message.filePoolBuffer,
    workspaceRootAbsolute: workerData.workspaceRootAbsolute as string,
  });

  const text = client.readFileText('file:///nested/deep.ts');
  const directories = client.getDirectories('file:///nested');
  const version = client.getScriptVersionForPath('file:///nested/deep.ts');
  parentPort?.postMessage({ text, directories, version });
});
