import { createOpfsEventLog } from '#browser.js';
import { createAgentSession } from '#harness/session.js';
import { serializeLogEvent } from '#log/serialization.js';
import type { AgentLogEvent } from '#log/event-types.js';
import type { ModelTransport, ToolRegistry } from '#waist/ports.js';

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

const invocationEvent = (sequence: number): AgentLogEvent =>
  sequence === 0
    ? {
        version: 1,
        type: 'model.invocation-prepared',
        leaderEpoch: 'browser-recovery-epoch',
        sequence,
        recordedAt: '2026-09-05T00:00:00.000Z',
        runId: 'browser-recovery-run',
        attemptId: 'browser-recovery-attempt',
        purpose: 'generation',
        modelId: 'browser-recovery-model',
      }
    : {
        version: 1,
        type: 'model.invocation-bound',
        leaderEpoch: 'browser-recovery-epoch',
        sequence,
        recordedAt: '2026-09-05T00:00:01.000Z',
        runId: 'browser-recovery-run',
        attemptId: 'browser-recovery-attempt',
        operationId: 'browser-recovery-operation',
        status: 'pending',
      };

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

    const recoveryFileName = 'agent-host-browser-recovery-test.jsonl';
    const recoveryFile = (await root.getFileHandle(recoveryFileName, { create: true })) as TestFileHandle;
    const recoverySeed = new TextEncoder().encode(
      `${serializeLogEvent(invocationEvent(0))}${serializeLogEvent(invocationEvent(1))}`,
    );
    let recoveryLookups = 0;
    let providerFetches = 0;
    const transport: ModelTransport = {
      usesBillingAttempt: () => true,
      lookupAttempt: async () => {
        recoveryLookups++;
        return { operationId: 'browser-recovery-operation', status: 'terminal' };
      },
      async *stream() {
        providerFetches++;
        yield { type: 'completed', stopReason: 'stop' };
      },
    };
    const tools: ToolRegistry = { list: () => [], invoke: async () => ({ content: null, isError: false }) };
    const recover = async (suffix: string): Promise<void> => {
      const seedRecovery = await recoveryFile.createSyncAccessHandle();
      seedRecovery.truncate(0);
      seedRecovery.write(recoverySeed, { at: 0 });
      seedRecovery.flush();
      seedRecovery.close();
      const durableRecoveryLog = await createOpfsEventLog({ fileHandle: recoveryFile });
      const session = await createAgentSession({
        chatId: 'browser-recovery-chat',
        runId: 'browser-recovery-run',
        leaderEpoch: 'browser-recovery-epoch',
        systemPrompt: 'browser recovery',
        model: { id: 'browser-recovery-model', contextWindow: 8192, providerKind: 'openai' },
        modelTransport: transport,
        toolRegistry: tools,
        eventLog: durableRecoveryLog,
      });
      await session.prompt({ id: `browser-recovery-user-${suffix}`, role: 'user', content: 'continue' });
      await session.close();
    };
    await recover('first');
    await recover('second');

    globalThis.postMessage({
      origin: location.origin,
      healedCount,
      persistedCount,
      firstAppend,
      duplicateAppend,
      partialWriteRejected,
      recoveredAppend,
      recoveredCount: recoveredEvents.length,
      recoveryLookups,
      providerFetches,
    });
  } catch (error) {
    globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    await root.removeEntry(fileName).catch(() => undefined);
    await root.removeEntry('agent-host-browser-recovery-test.jsonl').catch(() => undefined);
  }
});
