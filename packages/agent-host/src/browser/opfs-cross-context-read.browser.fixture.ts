import { createOpfsEventLog } from '#browser.js';
import type { AgentLogEvent } from '#log/event-types.js';

/* HA0 OPFS spike, the writer: one dedicated worker holds the exclusive handle and appends `count` rows, one per append. */
const event = (sequence: number): AgentLogEvent => ({
  version: 1,
  type: 'message.appended',
  leaderEpoch: 'cross-context-epoch',
  sequence,
  recordedAt: '2026-11-26T00:00:00.000Z',
  runId: 'cross-context-run',
  message: { id: `cross-context-${String(sequence)}`, role: 'user', content: 'x'.repeat(200) },
});

globalThis.addEventListener('message', async (message: MessageEvent<{ fileName: string; count: number }>) => {
  const { fileName, count } = message.data;
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileName, { create: true });
    const log = await createOpfsEventLog({ fileHandle, access: 'write' });
    globalThis.postMessage({ type: 'opened' });
    const started = performance.now();
    for (let sequence = 0; sequence < count; sequence++) {
      // oxlint-disable-next-line no-await-in-loop -- One append per row is the load under test.
      await log.append(event(sequence));
    }
    const elapsed = performance.now() - started;
    await log.close();
    globalThis.postMessage({ type: 'done', elapsed });
  } catch (error) {
    globalThis.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
});
