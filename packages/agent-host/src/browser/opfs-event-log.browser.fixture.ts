// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createOpfsEventLog } from '#browser.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { serializeLogEvent } from '#log/serialization.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLogEvent } from '#log/event-types.js';

type TestSyncAccessHandle = {
  getSize(): number;
  read(bytes: Uint8Array<ArrayBuffer>, options?: { at?: number }): number;
  write(bytes: Uint8Array<ArrayBuffer>, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
};

type TestFileHandle = FileSystemFileHandle & {
  createSyncAccessHandle(): Promise<TestSyncAccessHandle>;
};

const event = (sequence: number): AgentLogEvent => ({
  version: 1,
  type: 'message.appended',
  leaderEpoch: 'browser-epoch',
  sequence,
  recordedAt: '2026-08-31T00:00:00.000Z',
  runId: 'browser-run',
  message: { id: `browser-message-${sequence}`, role: 'user', content: `${sequence}` },
});

globalThis.addEventListener('message', async () => {
  const root = await navigator.storage.getDirectory();
  const fileName = 'agent-host-browser-test.jsonl';
  try {
    const fileHandle = (await root.getFileHandle(fileName, { create: true })) as TestFileHandle;
    const seedHandle = await fileHandle.createSyncAccessHandle();
    seedHandle.truncate(0);
    const seed = new TextEncoder().encode(`${serializeLogEvent(event(0))}{"version":1`);
    seedHandle.write(seed, { at: 0 });
    seedHandle.flush();
    seedHandle.close();

    const log = await createOpfsEventLog({ fileHandle });
    const healedEvents = await log.read();
    const healedCount = healedEvents.length;
    const firstAppend = await log.append(event(1));
    const duplicateAppend = await log.append(event(1));
    await log.close();

    const reopened = await createOpfsEventLog({ fileHandle });
    const persistedEvents = await reopened.read();
    const persistedCount = persistedEvents.length;
    await reopened.close();

    let failedBytes = new Uint8Array(new ArrayBuffer(0));
    let failFirstWrite = true;
    const failingHandle: TestSyncAccessHandle = {
      getSize: () => failedBytes.byteLength,
      read: (buffer, options) => {
        const at = options?.at ?? 0;
        const available = failedBytes.subarray(at, at + buffer.byteLength);
        buffer.set(available);
        return available.byteLength;
      },
      write: (buffer, options) => {
        const at = options?.at ?? 0;
        const count = failFirstWrite ? Math.max(1, Math.floor(buffer.byteLength / 2)) : buffer.byteLength;
        const next = new Uint8Array(new ArrayBuffer(Math.max(failedBytes.byteLength, at + count)));
        next.set(failedBytes);
        next.set(buffer.subarray(0, count), at);
        failedBytes = next;
        if (failFirstWrite) {
          failFirstWrite = false;
          throw new Error('injected OPFS partial write');
        }
        return count;
      },
      truncate: (size) => {
        failedBytes = failedBytes.slice(0, size);
      },
      flush: () => undefined,
      close: () => undefined,
    };
    const failingFile = {
      createSyncAccessHandle: async () => failingHandle,
    } as unknown as FileSystemFileHandle;
    const failureAtomicLog = await createOpfsEventLog({ fileHandle: failingFile });
    let partialWriteRejected = false;
    try {
      await failureAtomicLog.append(event(0));
    } catch {
      partialWriteRejected = true;
    }
    const recoveredAppend = await failureAtomicLog.append(event(0));
    const recoveredEvents = await failureAtomicLog.read();
    await failureAtomicLog.close();

    globalThis.postMessage({
      origin: location.origin,
      healedCount,
      persistedCount,
      firstAppend,
      duplicateAppend,
      partialWriteRejected,
      recoveredAppend,
      recoveredCount: recoveredEvents.length,
    });
  } catch (error) {
    globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    await root.removeEntry(fileName).catch(() => undefined);
  }
});
