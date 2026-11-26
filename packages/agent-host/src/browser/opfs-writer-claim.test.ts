/**
 * The chat's OPFS writer opens only under a claim (RH-R1).
 *
 * The writer is the log's exclusive sync access handle. The leader takes it under the chat's lock and closes it when
 * the chat goes quiescent, so the next run, here or in another tab, takes it again. The signed-in evidence observer
 * read its rows through the host, which opened a writer whenever it held none: a page read that landed after the
 * relinquish (the second page of a chat past 256 rows, or any read a rating made later) took the handle outside the
 * lock, nothing ever closed it, and every later turn of that chat was refused `WRITER_LOCKED` until the page was
 * reloaded (launch audit, PERF-1).
 */
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { createBrowserChatStore } from '#browser.js';
import { memoryOpfsDirectory, openHandles } from '#browser/opfs-directory.fixture.js';
import type { MemoryOpfsFiles } from '#browser/opfs-directory.fixture.js';
import { delays, model, until } from '#browser/leadership.fixture.js';
import { fakePlacement } from '#host/tau-agent-host.fixture.js';
import { createAgentLauncher } from '#launchers/agent-launcher.js';
import type { AgentLauncher, AgentLauncherOptions } from '#launchers/agent-launcher.js';
import { followChat } from '#log/follow-chat.js';
import type { AgentLogEvent } from '#log/event-types.js';
import type { ModelTransport, ToolRegistry } from '#waist/ports.js';
import type { CommandAnswer } from '#wire/commands.schema.js';

const emptyTools: ToolRegistry = { list: () => [], invoke: async () => ({ content: 'no tools', isError: true }) };

const answeringTransport: ModelTransport = {
  funding: { type: 'unfunded' },
  async *stream() {
    await sleep(1);
    yield { type: 'text-delta', text: 'Done.' };
    yield { type: 'completed', stopReason: 'stop' };
  },
};

const launchers: AgentLauncher[] = [];
afterEach(async () => {
  await Promise.all(launchers.splice(0).map(async (launcher) => launcher.close()));
});

let projects = 0;
const launch = (
  onChatQuiescent?: AgentLauncherOptions['onChatQuiescent'],
): Readonly<{ launcher: AgentLauncher; files: MemoryOpfsFiles }> => {
  /* The OPFS log refuses a null origin; Node has no `location`. */
  (globalThis as { location?: unknown }).location ??= { origin: 'http://localhost' };
  projects += 1;
  const files: MemoryOpfsFiles = new Map();
  const launcher = createAgentLauncher({
    chats: createBrowserChatStore({
      projectId: `project-writer-claim-${String(projects)}`,
      tabId: 'tab-1',
      build: 'build-1',
      log: { kind: 'opfs', directory: memoryOpfsDirectory(files) },
      delays,
    }),
    modelTransport: answeringTransport,
    credential: () => ({ mode: 'session' }),
    model,
    systemPrompt: 'You are Tau.',
    toolRegistry: emptyTools,
    turnPlacement: fakePlacement({ registry: emptyTools }).port,
    ...(onChatQuiescent === undefined ? {} : { onChatQuiescent }),
  });
  launchers.push(launcher);
  return { launcher, files };
};

const chatId = 'chat-1';
let keys = 0;

/** Start a run and follow it to its end, as the page does; the chat is relinquished once it is quiescent. */
const runToEnd = async (launcher: AgentLauncher, files: MemoryOpfsFiles, runId: string): Promise<CommandAnswer> => {
  keys += 1;
  const answer = await launcher.execute({
    type: 'start',
    commandId: `cmd-${String(keys)}`,
    payload: { chatId, runId, trigger: 'submit', message: { id: `user-${runId}`, role: 'user', content: 'hello' } },
  });
  if (answer.status === 'refused') {
    return answer;
  }
  const followed = new AbortController();
  // oxlint-disable-next-line no-empty-pattern -- only the follow's end matters.
  for await (const {} of followChat(launcher.read, chatId, {
    signal: followed.signal,
    until: (ledger) => ledger.runs[runId]?.appendState === 'settled',
  })) {
    /* Each batch moves the ledger. */
  }
  followed.abort();
  await until(() => openHandles(files) === 0);
  return answer;
};

/** Every own row of the chat, one row a page, through `read`. */
const pageThrough = async (read: AgentLauncher['readEvents']): Promise<AgentLogEvent[]> => {
  const rows: AgentLogEvent[] = [];
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each page starts where the one before it ended.
    const batch = await read({ chatId, cursor: rows.length, limit: 1 });
    rows.push(...batch.events);
    if (batch.events.length === 0 || batch.nextCursor >= batch.endCursor) {
      return rows;
    }
  }
};

describe('the OPFS writer opens only under a claim', () => {
  it('should refuse a read through the host of a relinquished chat, and start the next turn', async () => {
    const { launcher, files } = launch();
    expect(await runToEnd(launcher, files, 'run-1')).toMatchObject({ status: 'applied' });

    await expect(launcher.host.readEvents({ chatId, cursor: 0, limit: 256 })).rejects.toMatchObject({
      code: 'LOG_CLOSED',
    });

    expect(openHandles(files)).toBe(0);
    expect(await runToEnd(launcher, files, 'run-2')).toMatchObject({ status: 'applied' });
  });

  it("should read an idle chat's own rows through the launcher without taking its handle", async () => {
    const { launcher, files } = launch();
    expect(await runToEnd(launcher, files, 'run-1')).toMatchObject({ status: 'applied' });

    const batch = await launcher.readEvents({ chatId, cursor: 0, limit: 256 });

    expect(batch.events.at(-1)).toMatchObject({ runId: 'run-1', type: 'turn.finalized' });
    expect(batch.events).toHaveLength(batch.endCursor);
    expect(openHandles(files)).toBe(0);
    expect(await runToEnd(launcher, files, 'run-2')).toMatchObject({ status: 'applied' });
  });

  it('should give an observer every row when the chat is relinquished between its pages', async () => {
    const observed: Array<Promise<AgentLogEvent[] | undefined>> = [];
    /* The evidence observer reads at quiescence, page by page, while the leader lets the chat go. A read the
     * launcher's close met is the observer's own loss. */
    const observe = async (): Promise<AgentLogEvent[] | undefined> => {
      try {
        return await pageThrough(launcher.readEvents);
      } catch {
        return undefined;
      }
    };
    const { launcher, files } = launch((_chatId, quiescent) => {
      if (quiescent) {
        observed.push(observe());
      }
    });
    expect(await runToEnd(launcher, files, 'run-1')).toMatchObject({ status: 'applied' });
    const observations = await Promise.all(observed);
    const rows = observations.find((observation) => observation?.at(-1)?.type === 'turn.finalized');

    const whole = await launcher.readEvents({ chatId, cursor: 0, limit: 256 });
    expect(rows).toEqual(whole.events);
    expect(rows?.at(-1)).toMatchObject({ runId: 'run-1', type: 'turn.finalized' });
    expect(openHandles(files)).toBe(0);
    expect(await runToEnd(launcher, files, 'run-2')).toMatchObject({ status: 'applied' });
  });
});
