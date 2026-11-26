/**
 * A run no driver holds is abandoned whenever a reader finds it, not only at the reader's first sight of its chat
 * (RH-R1).
 *
 * The launcher asked for a chat's reconciling claim on the first verb that named the chat, on the assumption that a
 * run can only have lost its driver before this process first saw it. A run that starts afterwards loses its driver
 * too: its leader tab dies while another tab watches (launch audit, H-2), or its log refuses a write for a reason
 * that is not a fence, such as a full origin, and its incarnation closes (H-3). Nothing asked again, so the log's last
 * word stayed `running`, the page drew a working turn that nothing executed, and every later message queued behind it
 * until a command or a reload happened to claim the chat.
 */
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { createBrowserChatStore } from '#browser.js';
import {
  closeLaunchers,
  delays,
  heldLocks,
  launch,
  memoryFileSystem,
  model,
  projectId,
  rowsOf,
  seedRunningChat,
  start,
  until,
} from '#browser/leadership.fixture.js';
import type { MemoryFileSystem } from '#browser/leadership.fixture.js';
import { fakePlacement } from '#host/tau-agent-host.fixture.js';
import { createAgentLauncher } from '#launchers/agent-launcher.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import { chatLeadershipNames } from '#launchers/leadership/names.js';
import type { AgentLogEvent } from '#log/event-types.js';
import type { ModelStreamEvent, ModelTransport, ToolRegistry } from '#waist/ports.js';

const emptyTools: ToolRegistry = { list: () => [], invoke: async () => ({ content: 'no tools', isError: true }) };

const launchers: AgentLauncher[] = [];
afterEach(async () => {
  await Promise.all(launchers.splice(0).map(async (launcher) => launcher.close()));
  await closeLaunchers();
});

/** One read as a page's subscription makes it: from `cursor`, parked for a moment at the log's end. */
const read = async (launcher: AgentLauncher, chatId: string, cursor: number): Promise<void> => {
  await launcher
    .read({ chatId, cursor, limit: 16, maxBytes: 1_048_576, signal: AbortSignal.timeout(60) })
    .catch(() => undefined);
};

const lifecycleRows = (fileSystem: MemoryFileSystem, chatId: string): AgentLogEvent[] =>
  rowsOf(fileSystem, chatId).filter((row) => row.type === 'run.lifecycle');

const lifecycles = (fileSystem: MemoryFileSystem, chatId: string): string[] =>
  lifecycleRows(fileSystem, chatId).flatMap((row) => (row.type === 'run.lifecycle' ? [row.state] : []));

const lastLifecycle = (fileSystem: MemoryFileSystem, chatId: string): AgentLogEvent | undefined =>
  lifecycleRows(fileSystem, chatId).at(-1);

/** Keep reading, and only reading, until the chat's run has an ending row. */
const readUntilEnded = async (launcher: AgentLauncher, fileSystem: MemoryFileSystem, chatId: string): Promise<void> => {
  await until(async () => {
    await read(launcher, chatId, 0);
    await read(launcher, chatId, rowsOf(fileSystem, chatId).length);
    return lifecycles(fileSystem, chatId).at(-1) === 'failed';
  }, 60);
};

/** A provider filesystem whose appends are refused while `full` is set, as an origin out of quota refuses them. */
const fillable = (): Readonly<{ fileSystem: MemoryFileSystem; storage: { full: boolean; refusals: number } }> => {
  const inner = memoryFileSystem();
  const storage = { full: false, refusals: 0 };
  return {
    storage,
    fileSystem: {
      ...inner,
      appendFile: async (path, data) => {
        if (storage.full) {
          storage.refusals += 1;
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        await inner.appendFile!(path, data);
      },
    },
  };
};

/** A launcher whose model answers only once `release` is called, so the run is live across whatever the case does. */
const launchGated = (
  fileSystem: MemoryFileSystem,
): Readonly<{ launcher: AgentLauncher; streaming: Promise<void>; release: () => void }> => {
  const streaming = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const modelTransport: ModelTransport = {
    funding: { type: 'unfunded' },
    async *stream(): AsyncGenerator<ModelStreamEvent> {
      streaming.resolve();
      await released.promise;
      yield { type: 'text-delta', text: 'Done.' };
      yield { type: 'completed', stopReason: 'stop' };
    },
  };
  const launcher = createAgentLauncher({
    chats: createBrowserChatStore({
      projectId,
      tabId: 'tab-1',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
      delays,
    }),
    modelTransport,
    credential: () => ({ mode: 'session' }),
    model,
    systemPrompt: 'You are Tau.',
    toolRegistry: emptyTools,
    turnPlacement: fakePlacement({ registry: emptyTools }).port,
    driverlessRetry: 40,
  });
  launchers.push(launcher);
  return {
    launcher,
    streaming: streaming.promise,
    release: () => {
      released.resolve();
    },
  };
};

const lockOf = (chatId: string): string => chatLeadershipNames(projectId, chatId).lock;

const lockHeld = async (chatId: string): Promise<boolean> => {
  const held = await heldLocks();
  return held.includes(lockOf(chatId));
};

describe('a run no driver holds', () => {
  it('should be abandoned by a tab that first read its chat before the run began', async () => {
    const fileSystem = memoryFileSystem();
    const chatId = 'chat-orphaned-late';
    const viewer = launch(fileSystem, 'tab-b');
    /* This tab opens the chat while nothing runs in it. */
    await read(viewer, chatId, 0);
    /* Another tab admits and runs a turn, then dies: its rows are in the log, its lock and its heartbeat are gone. */
    seedRunningChat(fileSystem, chatId);
    expect(await heldLocks()).not.toContain(lockOf(chatId));

    await readUntilEnded(viewer, fileSystem, chatId);

    expect(lastLifecycle(fileSystem, chatId)).toMatchObject({
      runId: 'run-1',
      state: 'failed',
      detail: { code: 'RUN_ABANDONED' },
    });
  });

  it('should be abandoned once storage takes writes again, after a write it refused ended the incarnation', async () => {
    const { fileSystem, storage } = fillable();
    const chatId = 'chat-storage-full';
    const { launcher, streaming, release } = launchGated(fileSystem);
    expect(await start(launcher, chatId, 'run-1')).toMatchObject({ status: 'applied' });
    await streaming;
    /* The origin fills while the model answers: the run's next row is refused, and not by a fence. */
    storage.full = true;
    release();
    await until(async () => storage.refusals > 0 && !(await lockHeld(chatId)));
    expect(lifecycles(fileSystem, chatId).at(-1)).toBe('running');

    /* The person frees space. Nothing is sent: the page only keeps reading. */
    storage.full = false;
    await readUntilEnded(launcher, fileSystem, chatId);

    expect(lastLifecycle(fileSystem, chatId)).toMatchObject({ runId: 'run-1', state: 'failed' });
    await until(async () => !(await lockHeld(chatId)));
    expect(await start(launcher, chatId, 'run-2')).toMatchObject({ status: 'applied' });
  });

  it('should be asked for at a bounded rate while storage keeps refusing the write that would end it', async () => {
    const { fileSystem, storage } = fillable();
    const chatId = 'chat-storage-stays-full';
    const { launcher, streaming, release } = launchGated(fileSystem);
    expect(await start(launcher, chatId, 'run-1')).toMatchObject({ status: 'applied' });
    await streaming;
    storage.full = true;
    release();
    await until(async () => storage.refusals > 0 && !(await lockHeld(chatId)));

    /* A page reads without pause for 400 ms, ten times the first wait between asks. */
    const refusedBefore = storage.refusals;
    const reading = new AbortController();
    const reader = (async (): Promise<void> => {
      while (!reading.signal.aborted) {
        // oxlint-disable-next-line no-await-in-loop -- a subscription reads one batch after another.
        await read(launcher, chatId, 0);
        /* A read from the start is answered at once; yield so the clock runs. */
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await sleep(2);
      }
    })();
    await sleep(400);
    reading.abort();
    await reader;

    /* Asks at 0, 40, 120 and 280 ms: each wait doubles. Each ask is at most one lock append and one row append. */
    expect(storage.refusals - refusedBefore).toBeGreaterThan(0);
    expect(storage.refusals - refusedBefore).toBeLessThanOrEqual(8);
    expect(lifecycles(fileSystem, chatId).at(-1)).toBe('running');
  });
});
