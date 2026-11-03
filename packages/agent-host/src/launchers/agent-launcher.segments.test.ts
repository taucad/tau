/**
 * A chat two devices have written (XD1): this device appends to its own `events.jsonl`, and sync projects every other
 * device's log beside it as `events/<deviceId>.jsonl`. The model's next turn has to see both devices' turns, in merged
 * order, on every host; the writer still appends only to its own file, and run bookkeeping reads only its own rows.
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulatedClock } from 'xstate';

import { createBrowserChatStore } from '#browser.js';
import { memoryFileSystem } from '#browser/leadership.fixture.js';
import type { MemoryFileSystem } from '#browser/leadership.fixture.js';
import { fakePlacement } from '#host/tau-agent-host.fixture.js';
import { createAgentLauncher } from '#launchers/agent-launcher.js';
import type { AgentLauncher, AgentLauncherOptions } from '#launchers/agent-launcher.js';
import { chatStoreBinding, createChatStore } from '#launchers/chat-store.js';
import type { ChatStore } from '#launchers/chat-store.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import type { AgentLogEvent, ProviderMessage } from '#log/event-types.js';
import { foreignRunStaleMilliseconds } from '#log/foreign-runs.js';
import { foreignClockAheadMilliseconds } from '#log/segments.js';
import { createNodeChatStore } from '#node.js';
import type {
  HostRunSnapshot,
  ModelStreamEvent,
  ModelStreamRequest,
  ModelTransport,
  ToolRegistry,
  TurnPlacementPort,
} from '#waist/ports.js';
import { refusalOf } from '#wire/refusals.js';

const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;
const emptyTools: ToolRegistry = { list: () => [], invoke: async () => ({ content: 'no tools', isError: true }) };
const chatId = 'chat-1';
const decoder = new TextDecoder();

/** A model that answers every call with one line of text and records what it was sent. */
const recordingModel = (reply: string): Readonly<{ transport: ModelTransport; requests: ModelStreamRequest[] }> => {
  const requests: ModelStreamRequest[] = [];
  return {
    requests,
    transport: {
      funding: { type: 'unfunded' },
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        requests.push(request);
        yield { type: 'text-delta', text: reply };
        yield { type: 'completed', stopReason: 'stop' };
      },
    },
  };
};

/** A placement whose chats reach another device: every publish is recorded. */
const sharedPublish: NonNullable<TurnPlacementPort['publish']> = async ({ requestId }) => ({
  requestId,
  status: 'applied',
});

const launchers: AgentLauncher[] = [];
const roots: string[] = [];
const quiescentChats = new WeakMap<AgentLauncher, Set<string>>();

afterEach(async () => {
  await Promise.all(launchers.splice(0).map(async (launcher) => launcher.close()));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const launch = (
  chats: ChatStore,
  transport: ModelTransport,
  options: Readonly<{
    runHeartbeat?: number;
    pausedRunHold?: number;
    idleEviction?: number;
    closingWait?: number;
    segmentRefresh?: number;
    publish?: NonNullable<TurnPlacementPort['publish']>;
    pull?: NonNullable<TurnPlacementPort['pull']>;
    placement?: TurnPlacementPort;
    clock?: AgentLauncherOptions['clock'];
  }> = {},
): AgentLauncher => {
  const fake = options.placement ?? fakePlacement({ registry: emptyTools }).port;
  const placement = options.pull === undefined ? fake : { ...fake, pull: options.pull };
  const quiescent = new Set<string>();
  const binding = chatStoreBinding(chats);
  const launcher = createAgentLauncher({
    chats: createChatStore({
      ...binding,
      leadership: (host) => {
        const port = binding.leadership(host);
        return {
          ...port,
          quiescent: (id, ready) => {
            if (ready) {
              quiescent.add(id);
            } else {
              quiescent.delete(id);
            }
            port.quiescent(id, ready);
          },
        };
      },
    }),
    modelTransport: transport,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    credential: () => ({ mode: 'session' }),
    model,
    systemPrompt: 'You are Tau.',
    toolRegistry: emptyTools,
    turnPlacement: options.publish === undefined ? placement : { ...placement, publish: options.publish },
    delays: {
      ...(options.runHeartbeat === undefined ? {} : { runHeartbeat: options.runHeartbeat }),
      ...(options.pausedRunHold === undefined ? {} : { pausedRunHold: options.pausedRunHold }),
      ...(options.idleEviction === undefined ? {} : { idleEviction: options.idleEviction }),
      ...(options.closingWait === undefined ? {} : { closingWait: options.closingWait }),
      ...(options.segmentRefresh === undefined ? {} : { segmentRefresh: options.segmentRefresh }),
    },
  });
  launchers.push(launcher);
  quiescentChats.set(launcher, quiescent);
  return launcher;
};

let keys = 0;
const key = (): string => {
  keys += 1;
  return `cmd-${String(keys)}`;
};

/** Wait until a run completes and its placement settlement releases the chat. */
const settleRun = async (launcher: AgentLauncher, runId: string): Promise<HostRunSnapshot> => {
  for (let attempt = 0; attempt < 300; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- polling a durable projection is sequential by nature.
    const attached = await launcher.execute({ type: 'attach', commandId: key(), payload: { chatId } });
    const snapshot =
      attached.status === 'applied' && attached.effect === 'not-applied'
        ? (attached.details as { readonly snapshot?: HostRunSnapshot }).snapshot
        : undefined;
    if (snapshot?.runId === runId && snapshot.state === 'completed' && quiescentChats.get(launcher)?.has(chatId)) {
      return snapshot;
    }
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await sleep(10);
  }
  throw new Error(`Run ${runId} never completed.`);
};

/** Start a turn once the chat is free (the last run's settlement may still be landing), and wait until it completes. */
const turnWhenFree = async (launcher: AgentLauncher, runId: string, text: string): Promise<HostRunSnapshot> => {
  await vi.waitFor(
    async () => {
      const answer = await launcher.execute({
        type: 'start',
        commandId: key(),
        payload: { chatId, runId, trigger: 'submit', message: { id: `user-${runId}`, role: 'user', content: text } },
      });
      expect(answer, JSON.stringify(answer)).toMatchObject({ status: 'applied' });
    },
    { timeout: 3000, interval: 20 },
  );
  return settleRun(launcher, runId);
};

/** Start one user turn and wait until its run completes. */
const turn = async (launcher: AgentLauncher, runId: string, text: string): Promise<HostRunSnapshot | undefined> => {
  const answer = await launcher.execute({
    type: 'start',
    commandId: key(),
    payload: { chatId, runId, trigger: 'submit', message: { id: `user-${runId}`, role: 'user', content: text } },
  });
  expect(answer.status, JSON.stringify(answer)).toBe('applied');
  return settleRun(launcher, runId);
};

/** What the model was shown, as `role: text` lines. */
const transcriptOf = (request: ModelStreamRequest | undefined): string[] =>
  (request?.messages ?? []).flatMap((message: ProviderMessage) => {
    if (message.role !== 'user' && message.role !== 'assistant') {
      return [];
    }
    const { content } = message;
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .map((part: unknown) =>
                typeof part === 'object' && part !== null && 'text' in part ? String(part.text) : '',
              )
              .join('')
          : '';
    return text === '' ? [] : [`${message.role}: ${text}`];
  });

/* Whole lines only: a log read while its writer appends can end in a line still being written. */
const rowsOf = (bytes: Uint8Array<ArrayBuffer> | string): AgentLogEvent[] => {
  const text = typeof bytes === 'string' ? bytes : decoder.decode(bytes);
  return text
    .slice(0, text.lastIndexOf('\n') + 1)
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as AgentLogEvent);
};

/** Wait until a log holds a `running` row. */
const runningIn = async (path: string): Promise<void> => {
  for (let attempt = 0; attempt < 300; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- polling a durable file is sequential by nature.
    const rows = rowsOf(await readFile(path, 'utf8').catch(() => ''));
    if (rows.some((row) => row.type === 'run.lifecycle' && row.state === 'running')) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await sleep(10);
  }
  throw new Error(`No run started in ${path}.`);
};

describe('a chat continued on a second device', () => {
  describe('on the Node host', () => {
    const workspace = async (): Promise<string> => {
      const root = await mkdtemp(join(tmpdir(), 'tau-chat-segments-'));
      roots.push(root);
      return root;
    };
    const ownLog = (root: string): string => join(root, '.tau', 'chats', chatId, 'events.jsonl');
    /** Sync's projection of another device's log into this checkout (`chat-ref.ts` `projectChats`). */
    const project = async (root: string, deviceId: string, bytes: string): Promise<void> => {
      const directory = join(root, '.tau', 'chats', chatId, 'events');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `${deviceId}.jsonl`), bytes);
    };

    it('should give the model both devices’ turns in merged order, in both directions', async () => {
      const desktop = await workspace();
      const phone = await workspace();
      const desktopModel = recordingModel('desktop answer');
      const phoneModel = recordingModel('phone answer');
      const onDesktop = launch(createNodeChatStore({ workspaceRoot: desktop }), desktopModel.transport);
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), phoneModel.transport);

      await turn(onDesktop, 'run-desktop-1', 'first, on the desktop');
      await project(phone, 'device-desktop', await readFile(ownLog(desktop), 'utf8'));

      await turn(onPhone, 'run-phone-1', 'second, on the phone');
      expect(transcriptOf(phoneModel.requests.at(-1))).toEqual([
        'user: first, on the desktop',
        'assistant: desktop answer',
        'user: second, on the phone',
      ]);

      /* The desktop's log is still open from its first turn: the next admission reads what sync brought since. */
      await project(desktop, 'device-phone', await readFile(ownLog(phone), 'utf8'));
      await turn(onDesktop, 'run-desktop-2', 'third, back on the desktop');
      expect(transcriptOf(desktopModel.requests.at(-1))).toEqual([
        'user: first, on the desktop',
        'assistant: desktop answer',
        'user: second, on the phone',
        'assistant: phone answer',
        'user: third, back on the desktop',
      ]);
    });

    /*
     * A device keeps one term while its incarnation stays open, and a term's rows merge together (CL-R14). A turn the
     * desktop takes after the phone's must not land in the desktop's older term, or every later reading puts the
     * phone's turn after it: the desktop opens a new term for it.
     */
    it('should merge a turn after another device’s turn when its incarnation stayed open across that turn', async () => {
      const desktop = await workspace();
      const phone = await workspace();
      const desktopModel = recordingModel('desktop answer');
      const phoneModel = recordingModel('phone answer');
      const onDesktop = launch(createNodeChatStore({ workspaceRoot: desktop }), desktopModel.transport);
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), phoneModel.transport);

      await turn(onDesktop, 'run-desktop-1', 'first, on the desktop');
      await project(phone, 'device-desktop', await readFile(ownLog(desktop), 'utf8'));
      await turn(onPhone, 'run-phone-1', 'second, on the phone');
      await project(desktop, 'device-phone', await readFile(ownLog(phone), 'utf8'));
      await turn(onDesktop, 'run-desktop-2', 'third, back on the desktop');
      /* The last turn's settlement may still be landing (`settling`): the next one is sent once the chat is free. */
      await vi.waitFor(
        async () => {
          const probe = await onDesktop.execute({
            type: 'start',
            commandId: key(),
            payload: {
              chatId,
              runId: 'run-desktop-3',
              trigger: 'submit',
              message: { id: 'user-run-desktop-3', role: 'user', content: 'fourth, still on the desktop' },
            },
          });
          expect(probe).toMatchObject({ status: 'applied' });
        },
        { timeout: 3000, interval: 20 },
      );
      await settleRun(onDesktop, 'run-desktop-3');

      const inOrder = [
        'user: first, on the desktop',
        'assistant: desktop answer',
        'user: second, on the phone',
        'assistant: phone answer',
        'user: third, back on the desktop',
        'assistant: desktop answer',
        'user: fourth, still on the desktop',
      ];
      expect(transcriptOf(desktopModel.requests.at(-1))).toEqual(inOrder);
      const desktopRows = rowsOf(await readFile(ownLog(desktop), 'utf8'));
      const termOf = (runId: string): string | undefined => desktopRows.find((row) => row.runId === runId)?.leaderEpoch;
      expect(termOf('run-desktop-2')).not.toBe(termOf('run-desktop-1'));
      /* Its next turn, with nothing new from the phone, stays in the term it opened. */
      expect(termOf('run-desktop-3')).toBe(termOf('run-desktop-2'));

      await project(phone, 'device-desktop', await readFile(ownLog(desktop), 'utf8'));
      await turn(onPhone, 'run-phone-2', 'fifth, on the phone');
      expect(transcriptOf(phoneModel.requests.at(-1))).toEqual([
        ...inOrder,
        'assistant: desktop answer',
        'user: fifth, on the phone',
      ]);
    });

    /*
     * The term check never compares clocks across devices: it opens a new term when sync brought rows this term had not
     * seen when it began, and only then, whatever the other device's clock says.
     */
    describe('with another device’s clock skewed', () => {
      const shifted = (bytes: string, offset: number): string =>
        rowsOf(bytes)
          .map(
            (row) =>
              `${JSON.stringify({ ...row, recordedAt: new Date(Date.parse(row.recordedAt) + offset).toISOString() })}\n`,
          )
          .join('');
      const day = 24 * 60 * 60 * 1000;

      it.each([
        ['behind', -day],
        ['ahead', day],
      ])('should open a new term after a turn it had not seen, from a clock %s', async (_label, offset) => {
        const desktop = await workspace();
        const phone = await workspace();
        const onDesktop = launch(
          createNodeChatStore({ workspaceRoot: desktop }),
          recordingModel('desktop answer').transport,
        );
        const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), recordingModel('phone answer').transport);
        await turn(onDesktop, 'run-desktop-1', 'first, on the desktop');
        await project(phone, 'device-desktop', await readFile(ownLog(desktop), 'utf8'));
        await turn(onPhone, 'run-phone-1', 'second, on the phone');
        await project(desktop, 'device-phone', shifted(await readFile(ownLog(phone), 'utf8'), offset));

        await turnWhenFree(onDesktop, 'run-desktop-2', 'third, back on the desktop');

        const rows = rowsOf(await readFile(ownLog(desktop), 'utf8'));
        const termOf = (runId: string): string | undefined => rows.find((row) => row.runId === runId)?.leaderEpoch;
        expect(termOf('run-desktop-2')).not.toBe(termOf('run-desktop-1'));
      });

      /*
       * Round 18: a new term is opened in place, never by closing the old incarnation, so nothing waits on a close: a
       * close that would never finish holds the turn up not at all, and the turn is written under the new term.
       */
      it('should open a new term without closing the incarnation, so a close that never finishes holds nothing up', async () => {
        const desktop = await workspace();
        const phone = await workspace();
        const store = createNodeChatStore({ workspaceRoot: desktop });
        const hold = { closes: false };
        const released = Promise.withResolvers<void>();
        const binding = chatStoreBinding(store) as { openWriter: (id: string) => Promise<EventLogAppender> };
        const open = binding.openWriter;
        binding.openWriter = async (id) => {
          const log = await open(id);
          const close = log.close.bind(log);
          return Object.assign(log, {
            close: async () => {
              if (hold.closes) {
                await released.promise;
              }
              await close();
            },
          });
        };
        const onDesktop = launch(store, recordingModel('desktop answer').transport, { closingWait: 100 });
        const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), recordingModel('phone answer').transport);
        try {
          await turn(onDesktop, 'run-desktop-1', 'first, on the desktop');
          await project(phone, 'device-desktop', await readFile(ownLog(desktop), 'utf8'));
          await turn(onPhone, 'run-phone-1', 'second, on the phone');
          await project(desktop, 'device-phone', await readFile(ownLog(phone), 'utf8'));
          hold.closes = true;

          await turnWhenFree(onDesktop, 'run-desktop-2', 'third, back on the desktop');

          const rows = rowsOf(await readFile(ownLog(desktop), 'utf8'));
          const termOf = (runId: string): string | undefined => rows.find((row) => row.runId === runId)?.leaderEpoch;
          expect(termOf('run-desktop-2')).toBeDefined();
          expect(termOf('run-desktop-2')).not.toBe(termOf('run-desktop-1'));
        } finally {
          hold.closes = false;
          released.resolve();
        }
      }, 10_000);

      /* A Stop never waits behind term checks: the Send still checking when it arrives is superseded, never run. */
      it('should supersede a Send still behind term checks when a Stop arrives', async () => {
        const desktop = await workspace();
        const store = createNodeChatStore({ workspaceRoot: desktop });
        const hold = { refresh: false };
        const released = Promise.withResolvers<void>();
        const binding = chatStoreBinding(store) as { openWriter: (id: string) => Promise<EventLogAppender> };
        const open = binding.openWriter;
        binding.openWriter = async (id) => {
          const log = await open(id);
          const { refresh } = log;
          return refresh === undefined
            ? log
            : Object.assign(log, {
                refresh: async () => {
                  if (hold.refresh) {
                    hold.refresh = false;
                    await released.promise;
                  }
                  await refresh.call(log);
                },
              });
        };
        const gate = Promise.withResolvers<void>();
        const recorded = recordingModel('answer');
        let streams = 0;
        const onDesktop = launch(store, {
          ...recorded.transport,
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            streams += 1;
            if (streams > 1) {
              await gate.promise;
            }
            yield* recorded.transport.stream(request);
          },
        });
        try {
          await turn(onDesktop, 'run-desktop-1', 'first');
          hold.refresh = true;

          const first = onDesktop.execute({
            type: 'resume',
            commandId: key(),
            payload: { chatId, runId: 'run-absent' },
          });
          const send = onDesktop.execute({
            type: 'start',
            commandId: key(),
            payload: {
              chatId,
              runId: 'run-desktop-2',
              trigger: 'submit',
              message: { id: 'user-run-desktop-2', role: 'user', content: 'second' },
            },
          });
          const stop = onDesktop.execute({
            type: 'cancel',
            commandId: key(),
            payload: { chatId, runId: 'run-desktop-2' },
          });
          released.resolve();
          await first;

          await expect(send).resolves.toMatchObject({ status: 'refused', code: 'COMMAND_SUPERSEDED' });
          /*
           * Nothing ran, so there is nothing to stop: the Stop is answered at once, by whatever the chat holds then
           * (no run, or the first turn's incarnation still settling), and the superseded Send wrote nothing.
           */
          await expect(stop).resolves.toMatchObject({ status: 'refused' });
          expect(rowsOf(await readFile(ownLog(desktop), 'utf8')).some((row) => row.runId === 'run-desktop-2')).toBe(
            false,
          );
        } finally {
          gate.resolve();
        }
      });

      /*
       * Round 17: a Send answered before it reached the registry (superseded here) releases what its dispatch held, as
       * one answered by the registry does: once the host closes the chat's log, nothing keeps that log alive.
       */
      it('should release a superseded Send’s dispatch, keeping no closed log alive', async () => {
        setFlagsFromString('--expose-gc');
        const collect = runInNewContext('gc') as () => void;
        const desktop = await workspace();
        const store = createNodeChatStore({ workspaceRoot: desktop });
        const hold = { refresh: false };
        const released = Promise.withResolvers<void>();
        const opened: Array<WeakRef<EventLogAppender>> = [];
        const binding = chatStoreBinding(store) as { openWriter: (id: string) => Promise<EventLogAppender> };
        const open = binding.openWriter;
        binding.openWriter = async (id) => {
          const log = await open(id);
          opened.push(new WeakRef(log));
          const { refresh } = log;
          return refresh === undefined
            ? log
            : Object.assign(log, {
                refresh: async () => {
                  await refresh.call(log);
                  if (hold.refresh) {
                    hold.refresh = false;
                    await released.promise;
                  }
                },
              });
        };
        const onDesktop = launch(store, recordingModel('answer').transport);
        await turn(onDesktop, 'run-desktop-1', 'first');
        await sleep(50);
        hold.refresh = true;

        const send = onDesktop.execute({
          type: 'start',
          commandId: key(),
          payload: {
            chatId,
            runId: 'run-desktop-2',
            trigger: 'submit',
            message: { id: 'user-run-desktop-2', role: 'user', content: 'second' },
          },
        });
        const stop = onDesktop.execute({
          type: 'cancel',
          commandId: key(),
          payload: { chatId, runId: 'run-desktop-2' },
        });
        await stop;
        released.resolve();
        await expect(send).resolves.toMatchObject({ status: 'refused', code: 'COMMAND_SUPERSEDED' });
        await onDesktop.close();
        for (let round = 0; round < 5; round++) {
          // oxlint-disable-next-line no-await-in-loop -- each round lets the last one's releases run before collecting.
          await sleep(10);
          collect();
        }

        expect(opened.length).toBeGreaterThan(0);
        expect(opened.filter((log) => log.deref() !== undefined)).toEqual([]);
      });

      /*
       * A turn written after reading another device's rows merges after them, however far ahead that device's clock
       * is: its rows are stamped after every row it read, so the merge never puts it before rows its history names.
       */
      it('should merge a turn after the rows it read from a device whose clock is ahead within the bound', async () => {
        const desktop = await workspace();
        const phone = await workspace();
        const desktopModel = recordingModel('desktop answer');
        const onDesktop = launch(createNodeChatStore({ workspaceRoot: desktop }), desktopModel.transport);
        const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), recordingModel('phone answer').transport);
        await turn(onDesktop, 'run-desktop-1', 'first, on the desktop');
        await project(phone, 'device-desktop', await readFile(ownLog(desktop), 'utf8'));
        await turn(onPhone, 'run-phone-1', 'second, on the phone');
        const phoneRows = shifted(await readFile(ownLog(phone), 'utf8'), foreignClockAheadMilliseconds / 2);
        await project(desktop, 'device-phone', phoneRows);

        await turnWhenFree(onDesktop, 'run-desktop-2', 'third, back on the desktop');
        await turnWhenFree(onDesktop, 'run-desktop-3', 'fourth, still on the desktop');

        /* Terms merge by their start: the new term starts after the phone's, so its turn merges after the phone's. */
        const phoneStart = Math.min(...rowsOf(phoneRows).map((row) => Date.parse(row.recordedAt)));
        const second = rowsOf(await readFile(ownLog(desktop), 'utf8')).filter((row) => row.runId === 'run-desktop-2');
        expect(Math.min(...second.map((row) => Date.parse(row.recordedAt)))).toBeGreaterThan(phoneStart);
        expect(transcriptOf(desktopModel.requests.at(-1))).toEqual([
          'user: first, on the desktop',
          'assistant: desktop answer',
          'user: second, on the phone',
          'assistant: phone answer',
          'user: third, back on the desktop',
          'assistant: desktop answer',
          'user: fourth, still on the desktop',
        ]);
      });

      /*
       * Round 16: one fast or corrupt clock must not carry every device's rows into the future. A term dated further
       * ahead than the bound waits out of the history, so nothing written here names it, and this device's stamps stay
       * on its own clock.
       */
      it('should not follow a clock further ahead than the bound: its rows wait, and stamps stay on this clock', async () => {
        const desktop = await workspace();
        const phone = await workspace();
        const desktopModel = recordingModel('desktop answer');
        const onDesktop = launch(createNodeChatStore({ workspaceRoot: desktop }), desktopModel.transport);
        const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), recordingModel('phone answer').transport);
        await turn(onDesktop, 'run-desktop-1', 'first, on the desktop');
        await project(phone, 'device-desktop', await readFile(ownLog(desktop), 'utf8'));
        await turn(onPhone, 'run-phone-1', 'second, on the phone');
        await project(desktop, 'device-phone', shifted(await readFile(ownLog(phone), 'utf8'), day));

        const before = Date.now();
        await turnWhenFree(onDesktop, 'run-desktop-2', 'third, back on the desktop');
        const after = Date.now();

        const second = rowsOf(await readFile(ownLog(desktop), 'utf8')).filter((row) => row.runId === 'run-desktop-2');
        for (const row of second) {
          expect(Date.parse(row.recordedAt)).toBeGreaterThanOrEqual(before);
          expect(Date.parse(row.recordedAt)).toBeLessThanOrEqual(after);
        }
        expect(transcriptOf(desktopModel.requests.at(-1))).toEqual([
          'user: first, on the desktop',
          'assistant: desktop answer',
          'user: third, back on the desktop',
        ]);
      });

      /* Round 16: a run whose rows are dated a day ahead still holds the chat here, from when this device saw it. */
      it('should hold the chat for another device’s live run however far ahead its clock is', async () => {
        const desktop = await workspace();
        const phone = await workspace();
        const gate = Promise.withResolvers<void>();
        const recorded = recordingModel('phone answer');
        const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), {
          ...recorded.transport,
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            await gate.promise;
            yield* recorded.transport.stream(request);
          },
        });
        const onDesktop = launch(createNodeChatStore({ workspaceRoot: desktop }), recordingModel('desktop').transport);
        try {
          const started = await onPhone.execute({
            type: 'start',
            commandId: key(),
            payload: {
              chatId,
              runId: 'run-phone-1',
              trigger: 'submit',
              message: { id: 'user-run-phone-1', role: 'user', content: 'on the phone' },
            },
          });
          expect(started.status).toBe('applied');
          await runningIn(ownLog(phone));
          await project(desktop, 'device-phone', shifted(await readFile(ownLog(phone), 'utf8'), day));

          const refused = await onDesktop.execute({
            type: 'start',
            commandId: key(),
            payload: {
              chatId,
              runId: 'run-desktop-1',
              trigger: 'submit',
              message: { id: 'user-run-desktop-1', role: 'user', content: 'on the desktop' },
            },
          });

          expect(refused).toMatchObject({ status: 'refused', code: 'RUN_ACTIVE_ON_ANOTHER_DEVICE' });
        } finally {
          gate.resolve();
        }
      });

      it('should keep its term when nothing new came, however far behind the other device’s clock is', async () => {
        const desktop = await workspace();
        const phone = await workspace();
        const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), recordingModel('phone answer').transport);
        await turn(onPhone, 'run-phone-1', 'first, on the phone');
        await project(desktop, 'device-phone', shifted(await readFile(ownLog(phone), 'utf8'), -day));
        const onDesktop = launch(
          createNodeChatStore({ workspaceRoot: desktop }),
          recordingModel('desktop answer').transport,
        );
        await turn(onDesktop, 'run-desktop-1', 'second, on the desktop');

        await turnWhenFree(onDesktop, 'run-desktop-2', 'third, on the desktop');

        const rows = rowsOf(await readFile(ownLog(desktop), 'utf8'));
        const termOf = (runId: string): string | undefined => rows.find((row) => row.runId === runId)?.leaderEpoch;
        expect(termOf('run-desktop-2')).toBe(termOf('run-desktop-1'));
      });
    });

    /* The term check and the admission after it read what sync brought once, not twice, per command. */
    it('should read the other devices’ segments once per admission', async () => {
      const desktop = await workspace();
      const phone = await workspace();
      const store = createNodeChatStore({ workspaceRoot: desktop });
      let refreshes = 0;
      /* The launcher opens writers through the store's binding: count the refreshes of the logs it hands out. */
      const binding = chatStoreBinding(store) as { openWriter: (id: string) => Promise<EventLogAppender> };
      const open = binding.openWriter;
      binding.openWriter = async (id) => {
        const log = await open(id);
        const { refresh } = log;
        return refresh === undefined
          ? log
          : Object.assign(log, {
              refresh: async () => {
                refreshes += 1;
                await refresh.call(log);
              },
            });
      };
      const onDesktop = launch(store, recordingModel('desktop answer').transport);
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), recordingModel('phone answer').transport);
      await turn(onPhone, 'run-phone-1', 'first, on the phone');
      await project(desktop, 'device-phone', await readFile(ownLog(phone), 'utf8'));
      await turn(onDesktop, 'run-desktop-1', 'second, on the desktop');

      /* Retried while the last run's settlement lands: only the attempt that is admitted is counted. */
      await vi.waitFor(
        async () => {
          refreshes = 0;
          const answer = await onDesktop.execute({
            type: 'start',
            commandId: key(),
            payload: {
              chatId,
              runId: 'run-desktop-2',
              trigger: 'submit',
              message: { id: 'user-run-desktop-2', role: 'user', content: 'third, on the desktop' },
            },
          });
          expect(answer).toMatchObject({ status: 'applied' });
        },
        { timeout: 3000, interval: 20 },
      );

      expect(refreshes).toBe(1);
      await settleRun(onDesktop, 'run-desktop-2');
    });

    it('should append only this device’s rows to its own events.jsonl', async () => {
      const desktop = await workspace();
      const phone = await workspace();
      const onDesktop = launch(createNodeChatStore({ workspaceRoot: desktop }), recordingModel('desktop').transport);
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), recordingModel('phone').transport);

      await turn(onDesktop, 'run-desktop-1', 'first');
      const foreign = await readFile(ownLog(desktop), 'utf8');
      await project(phone, 'device-desktop', foreign);
      const snapshot = await turn(onPhone, 'run-phone-1', 'second');

      const own = rowsOf(await readFile(ownLog(phone), 'utf8'));
      const foreignEpochs = new Set(rowsOf(foreign).map((row) => row.leaderEpoch));
      expect(own.some((row) => foreignEpochs.has(row.leaderEpoch))).toBe(false);
      expect(new Set(own.map((row) => row.runId))).toEqual(new Set(['run-phone-1']));
      /* The foreign segment is read, never rewritten. */
      expect(await readFile(join(phone, '.tau', 'chats', chatId, 'events', 'device-desktop.jsonl'), 'utf8')).toBe(
        foreign,
      );
      /* Run bookkeeping is this device's: the phone's current run is its own, not the desktop's. */
      expect(snapshot?.runId).toBe('run-phone-1');
    });
  });

  /* XD3: a run in flight on one device holds the chat on every other device until it settles or goes stale. */
  describe('while the other device is running it', () => {
    const workspace = async (): Promise<string> => {
      const root = await mkdtemp(join(tmpdir(), 'tau-chat-fence-'));
      roots.push(root);
      return root;
    };
    const ownLog = (root: string): string => join(root, '.tau', 'chats', chatId, 'events.jsonl');
    const project = async (root: string, deviceId: string, bytes: string): Promise<void> => {
      const directory = join(root, '.tau', 'chats', chatId, 'events');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `${deviceId}.jsonl`), bytes);
    };
    /**
     * Pulls of the remote that found the desktop's segment as it is now for `quiet` milliseconds (past the bound by
     * default), as sync records them beside the segments (`events/pulled-at`, round 19).
     */
    const pulled = async (root: string, quiet = foreignRunStaleMilliseconds + 1): Promise<void> => {
      const directory = join(root, '.tau', 'chats', chatId, 'events');
      await mkdir(directory, { recursive: true });
      const { size } = await stat(join(directory, 'device-desktop.jsonl'));
      await writeFile(
        join(directory, 'pulled-at'),
        `${String(Date.now())}\ndevice-desktop.jsonl ${String(size)} ${String(quiet)}`,
      );
    };
    /** A model whose first call streams nothing until `release`, then answers like {@link recordingModel}. */
    const heldModel = (reply: string) => {
      const gate = Promise.withResolvers<void>();
      const recorded = recordingModel(reply);
      return {
        release: gate.resolve,
        transport: {
          ...recorded.transport,
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            await gate.promise;
            yield* recorded.transport.stream(request);
          },
        } satisfies ModelTransport,
      };
    };
    const start = async (launcher: AgentLauncher, runId: string, text: string) =>
      launcher.execute({
        type: 'start',
        commandId: key(),
        payload: {
          chatId,
          runId,
          trigger: 'submit',
          message: { id: `user-${runId}`, role: 'user', content: text },
        },
      });
    /** The desktop's log once its run is admitted and running, its model not yet answered. */
    const desktopInFlight = async (): Promise<
      Readonly<{
        desktop: string;
        launcher: AgentLauncher;
        release: () => void;
        bytes: string;
      }>
    > => {
      const desktop = await workspace();
      const held = heldModel('desktop answer');
      const launcher = launch(createNodeChatStore({ workspaceRoot: desktop }), held.transport);
      const started = await start(launcher, 'run-desktop-1', 'in flight on the desktop');
      expect(started.status).toBe('applied');
      let bytes = '';
      for (let attempt = 0; attempt < 300; attempt++) {
        // oxlint-disable-next-line no-await-in-loop -- polling a durable file is sequential by nature.
        bytes = await readFile(ownLog(desktop), 'utf8').catch(() => '');
        if (rowsOf(bytes).some((row) => row.type === 'run.lifecycle' && row.state === 'running')) {
          return { desktop, launcher, release: held.release, bytes };
        }
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await sleep(10);
      }
      throw new Error('The desktop run never started.');
    };
    const settle = async (launcher: AgentLauncher, runId: string): Promise<void> => {
      for (let attempt = 0; attempt < 300; attempt++) {
        // oxlint-disable-next-line no-await-in-loop -- polling a durable projection is sequential by nature.
        const attached = await launcher.execute({
          type: 'attach',
          commandId: key(),
          payload: { chatId },
        });
        const snapshot =
          attached.status === 'applied' && attached.effect === 'not-applied'
            ? (attached.details as { readonly snapshot?: HostRunSnapshot }).snapshot
            : undefined;
        if (snapshot?.runId === runId && snapshot.state === 'completed') {
          return;
        }
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await sleep(10);
      }
      throw new Error(`Run ${runId} never completed.`);
    };

    it('should refuse a second run with a retryable reason naming the other device, then admit it once that run settles', async () => {
      const inFlight = await desktopInFlight();
      const phone = await workspace();
      const phoneModel = recordingModel('phone answer');
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), phoneModel.transport);
      await project(phone, 'device-desktop', inFlight.bytes);

      const refused = await start(onPhone, 'run-phone-1', 'second, on the phone');

      expect(refused).toMatchObject({
        status: 'refused',
        code: 'RUN_ACTIVE_ON_ANOTHER_DEVICE',
        effect: 'not-applied',
        details: {
          deviceId: 'device-desktop',
          runId: 'run-desktop-1',
          state: 'running',
        },
      });
      expect(refusalOf('RUN_ACTIVE_ON_ANOTHER_DEVICE').retry).toBe('wait');
      expect(phoneModel.requests).toEqual([]);
      /* Nothing was written on the phone: the refusal is before admission. */
      expect(await readFile(ownLog(phone), 'utf8').catch(() => '')).toBe('');

      inFlight.release();
      await settle(inFlight.launcher, 'run-desktop-1');
      await project(phone, 'device-desktop', await readFile(ownLog(inFlight.desktop), 'utf8'));
      await turn(onPhone, 'run-phone-1', 'second, on the phone');

      expect(transcriptOf(phoneModel.requests.at(-1))).toEqual([
        'user: in flight on the desktop',
        'assistant: desktop answer',
        'user: second, on the phone',
      ]);
    });

    /* A segment that is there but cannot be read may hold a live run: the fence holds, retryably, and writes nothing. */
    it('should refuse a run while another device’s segment cannot be read', async () => {
      const phone = await workspace();
      const phoneModel = recordingModel('phone answer');
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), phoneModel.transport);
      /* A directory where a segment file should be: listed, but every read of it fails. */
      await mkdir(join(phone, '.tau', 'chats', chatId, 'events', 'device-desktop.jsonl'), { recursive: true });

      const refused = await start(onPhone, 'run-phone-1', 'on the phone');

      expect(refused).toMatchObject({ status: 'refused', code: 'SEGMENTS_UNREADABLE' });
      expect(refusalOf('SEGMENTS_UNREADABLE').retry).toBe('wait');
      expect(phoneModel.requests).toEqual([]);
      expect(await readFile(ownLog(phone), 'utf8').catch(() => '')).toBe('');
    });

    /* A `wait` refusal is answered by re-sending the same command: each send reads the other devices' segments again. */
    it('should read the segments again for a re-send of the same command, after either wait refusal', async () => {
      const inFlight = await desktopInFlight();
      const phone = await workspace();
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), recordingModel('phone answer').transport);
      const segments = join(phone, '.tau', 'chats', chatId, 'events');
      const command = {
        type: 'start',
        commandId: 'cmd-resent',
        payload: {
          chatId,
          runId: 'run-phone-1',
          trigger: 'submit',
          message: { id: 'user-run-phone-1', role: 'user', content: 'on the phone' },
        },
      } as const;
      /* Unreadable first: a directory where the desktop's segment should be. */
      await mkdir(join(segments, 'device-desktop.jsonl'), { recursive: true });
      await expect(onPhone.execute(command)).resolves.toMatchObject({ code: 'SEGMENTS_UNREADABLE' });

      await rm(join(segments, 'device-desktop.jsonl'), { recursive: true });
      await project(phone, 'device-desktop', inFlight.bytes);
      await expect(onPhone.execute(command)).resolves.toMatchObject({ code: 'RUN_ACTIVE_ON_ANOTHER_DEVICE' });

      inFlight.release();
      await settle(inFlight.launcher, 'run-desktop-1');
      await project(phone, 'device-desktop', await readFile(ownLog(inFlight.desktop), 'utf8'));
      await expect(onPhone.execute(command)).resolves.toMatchObject({ status: 'applied' });
      await settleRun(onPhone, 'run-phone-1');
    });

    /*
     * Round 18: quiet is evidenced, never inferred from a segment's age. The phone slept for two hours, so its copy of
     * the desktop's segment and its last pull are two hours old, while the desktop kept its run alive. Until a pull
     * shows the remote held nothing newer, the run holds the chat, and the refusal asks the placement for that pull.
     * A pull that brings the run's newer rows keeps it holding; one that finds nothing newer lets the phone go on.
     */
    it('should hold the chat for another device’s run however old its segment is here, until a pull shows it stayed quiet', async () => {
      const inFlight = await desktopInFlight();
      const phone = await workspace();
      const pulls: string[] = [];
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), recordingModel('phone answer').transport, {
        pull: async ({ requestId, chatId: pulledChat }) => {
          pulls.push(pulledChat);
          return { requestId, status: 'applied' };
        },
      });
      try {
        const hours = 2 * 60 * 60 * 1000;
        const slept = new Date(Date.now() - hours);
        await project(phone, 'device-desktop', inFlight.bytes);
        await utimes(join(phone, '.tau', 'chats', chatId, 'events', 'device-desktop.jsonl'), slept, slept);
        await pulled(phone, 60_000);

        expect(await start(onPhone, 'run-phone-1', 'second, on the phone')).toMatchObject({
          status: 'refused',
          code: 'RUN_ACTIVE_ON_ANOTHER_DEVICE',
          details: { runId: 'run-desktop-1' },
        });
        expect(pulls).toEqual([chatId]);

        /* The pull brings the heartbeat the desktop wrote meanwhile: the run is live, and still holds the chat. */
        const last = rowsOf(inFlight.bytes).at(-1)!;
        const heartbeat = {
          version: 1,
          leaderEpoch: last.leaderEpoch,
          sequence: last.sequence + 1,
          recordedAt: new Date().toISOString(),
          runId: 'run-desktop-1',
          type: 'run.heartbeat',
        };
        await project(phone, 'device-desktop', `${inFlight.bytes}${JSON.stringify(heartbeat)}\n`);
        await pulled(phone, 0);
        expect(await start(onPhone, 'run-phone-1', 'second, on the phone')).toMatchObject({
          code: 'RUN_ACTIVE_ON_ANOTHER_DEVICE',
        });

        /* A record of quiet for the bytes before the heartbeat says nothing of the bytes the phone holds now. */
        await writeFile(
          join(phone, '.tau', 'chats', chatId, 'events', 'pulled-at'),
          `${String(Date.now())}\ndevice-desktop.jsonl ${String(Buffer.byteLength(inFlight.bytes))} ${String(foreignRunStaleMilliseconds + 1)}`,
        );
        expect(await start(onPhone, 'run-phone-1', 'second, on the phone')).toMatchObject({
          code: 'RUN_ACTIVE_ON_ANOTHER_DEVICE',
        });

        /* Pulls past the bound find nothing newer than the phone's copy. */
        await pulled(phone);
        await turn(onPhone, 'run-phone-1', 'second, on the phone');
      } finally {
        inFlight.release();
      }
    });

    /*
     * Round 27: a device that cannot pull the chat (chat sync off, no remote, no record identity) never gets the pulls
     * that would show another device's quiet run abandoned. Its placement says so (`pull` refused `CHAT_NOT_SHARED`),
     * so once that run awaits pulls it no longer holds the chat: the phone goes on and says the run's turn as data.
     */
    it('should admit a run past another device’s quiet run when this device cannot pull the chat, saying its turn', async () => {
      const inFlight = await desktopInFlight();
      const phone = await workspace();
      const phoneModel = recordingModel('phone answer');
      const pulls: string[] = [];
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), phoneModel.transport, {
        pull: async ({ requestId, chatId: pulledChat }) => {
          pulls.push(pulledChat);
          return {
            requestId,
            status: 'refused',
            code: 'CHAT_NOT_SHARED',
            message: 'This project does not sync its chats.',
          };
        },
      });
      try {
        const slept = new Date(Date.now() - 2 * 60 * 60 * 1000);
        await project(phone, 'device-desktop', inFlight.bytes);
        await utimes(join(phone, '.tau', 'chats', chatId, 'events', 'device-desktop.jsonl'), slept, slept);

        expect(await start(onPhone, 'run-phone-1', 'second, on the phone')).toMatchObject({ status: 'applied' });
        await settleRun(onPhone, 'run-phone-1');
      } finally {
        inFlight.release();
      }

      expect(pulls).toEqual([chatId]);
      expect(transcriptOf(phoneModel.requests.at(-1))).toEqual([
        'user: in flight on the desktop',
        'user: second, on the phone',
      ]);
    });

    /*
     * Round 16: staleness is this device's own observation, never the run's `recordedAt`. The run's rows are dated
     * past the bound, yet the phone has only just seen them: it waits the bound out on its own clock, and a pull then
     * shows the remote held nothing newer (round 18). Once it goes on, it says the person's turn of the abandoned run as
     * data, in the batch that admits its own run, and the model is shown that turn but nothing the run left half done.
     */
    it('should admit a run once the other device’s run has gone stale here, saying its turn as data but nothing it left half done', async () => {
      const inFlight = await desktopInFlight();
      inFlight.release();
      const phone = await workspace();
      const phoneModel = recordingModel('phone answer');
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), phoneModel.transport);
      /* Only its lifecycle rows, which every snapshot of a running run holds: the person's message is in its admission. */
      const longAgo = new Date(Date.now() - foreignRunStaleMilliseconds - 60_000).toISOString();
      await project(
        phone,
        'device-desktop',
        rowsOf(inFlight.bytes)
          .filter((row) => row.type === 'run.lifecycle')
          .map((row) => `${JSON.stringify({ ...row, recordedAt: longAgo })}\n`)
          .join(''),
      );
      vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
      try {
        expect(await start(onPhone, 'run-phone-1', 'second, on the phone')).toMatchObject({
          status: 'refused',
          code: 'RUN_ACTIVE_ON_ANOTHER_DEVICE',
        });

        vi.setSystemTime(Date.now() + foreignRunStaleMilliseconds + 1000);
        await pulled(phone);
        await turn(onPhone, 'run-phone-1', 'second, on the phone');
      } finally {
        vi.useRealTimers();
      }

      expect(transcriptOf(phoneModel.requests.at(-1))).toEqual([
        'user: in flight on the desktop',
        'user: second, on the phone',
      ]);
      const rows = rowsOf(await readFile(ownLog(phone), 'utf8'));
      const said = rows.findIndex((row) => row.type === 'message.appended' && row.runId === 'run-desktop-1');
      expect(rows[said]).toMatchObject({
        message: { id: 'user-run-desktop-1', metadata: { tauInternal: { kind: 'abandoned-turn' } } },
      });
      expect(rows[said + 1]).toMatchObject({
        type: 'run.lifecycle',
        state: 'admitted',
        runId: 'run-phone-1',
        leaderEpoch: rows[said]!.leaderEpoch,
      });
    });

    /*
     * Round 16 (read-back lag): the phone read the desktop's run before its turn and answer synced, found it abandoned
     * and said its turn. The desktop's own rows arrive afterwards: its committed turn and the phone's copy merge as one.
     */
    it('should merge the turn it said for an abandoned run with that run’s own rows once they arrive', async () => {
      const inFlight = await desktopInFlight();
      inFlight.release();
      await settle(inFlight.launcher, 'run-desktop-1');
      const phone = await workspace();
      const phoneModel = recordingModel('phone answer');
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), phoneModel.transport);
      await project(
        phone,
        'device-desktop',
        rowsOf(inFlight.bytes)
          .filter((row) => row.type === 'run.lifecycle')
          .map((row) => `${JSON.stringify(row)}\n`)
          .join(''),
      );
      vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
      try {
        expect(await start(onPhone, 'run-phone-1', 'second, on the phone')).toMatchObject({ status: 'refused' });
        vi.setSystemTime(Date.now() + foreignRunStaleMilliseconds + 1000);
        await pulled(phone);
        await turn(onPhone, 'run-phone-1', 'second, on the phone');
      } finally {
        vi.useRealTimers();
      }

      await project(phone, 'device-desktop', await readFile(ownLog(inFlight.desktop), 'utf8'));
      await turn(onPhone, 'run-phone-2', 'third, on the phone');

      /* The desktop's turn once; its answer, which the phone's turn was not built on, stays out of what it retained. */
      expect(transcriptOf(phoneModel.requests.at(-1))).toEqual([
        'user: in flight on the desktop',
        'user: second, on the phone',
        'assistant: phone answer',
        'user: third, on the phone',
      ]);
    });

    /*
     * Round 16 (read-back lag): the phone's read lagged behind a desktop run that was still going, so it looked
     * abandoned and the phone went on, saying its turn. The run's newer rows arrive afterwards: the turn the phone
     * said is data and stays, once, whatever those rows say; a turn derived from the read would vanish with it.
     */
    it('should keep the turn it said for a run whose newer rows arrive after it went on', async () => {
      const inFlight = await desktopInFlight();
      const phone = await workspace();
      const phoneModel = recordingModel('phone answer');
      const placement = fakePlacement({ registry: emptyTools });
      const release = placement.holdAcknowledge();
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), phoneModel.transport, {
        placement: placement.port,
      });
      await project(
        phone,
        'device-desktop',
        rowsOf(inFlight.bytes)
          .filter((row) => row.type === 'run.lifecycle')
          .map((row) => `${JSON.stringify(row)}\n`)
          .join(''),
      );
      vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
      try {
        expect(await start(onPhone, 'run-phone-1', 'second, on the phone')).toMatchObject({ status: 'refused' });
        vi.setSystemTime(Date.now() + foreignRunStaleMilliseconds + 1000);
        await pulled(phone);
        let settled = false;
        const finishSecond = async (): Promise<void> => {
          await turn(onPhone, 'run-phone-1', 'second, on the phone');
          settled = true;
        };
        const second = finishSecond();
        await vi.waitFor(async () => {
          const attached = await onPhone.execute({ type: 'attach', commandId: key(), payload: { chatId } });
          expect(attached).toMatchObject({ details: { snapshot: { runId: 'run-phone-1', state: 'completed' } } });
        });
        /* Completion is durable before placement acknowledgement releases the chat. */
        expect(settled).toBe(false);
        expect(await start(onPhone, 'run-phone-2', 'third, on the phone')).toMatchObject({
          status: 'refused',
          code: 'CHAT_RUN_LIVE',
          effect: 'not-applied',
          details: { state: 'settling', runId: 'run-phone-1' },
        });
        release();
        await second;

        const last = rowsOf(inFlight.bytes).at(-1)!;
        const heartbeat = {
          version: 1,
          leaderEpoch: last.leaderEpoch,
          sequence: last.sequence + 1,
          recordedAt: new Date().toISOString(),
          runId: 'run-desktop-1',
          type: 'run.heartbeat',
        };
        await project(phone, 'device-desktop', `${inFlight.bytes}${JSON.stringify(heartbeat)}\n`);
        await turn(onPhone, 'run-phone-2', 'third, on the phone');
      } finally {
        release();
        vi.useRealTimers();
        inFlight.release();
      }

      expect(transcriptOf(phoneModel.requests.at(-1))).toEqual([
        'user: in flight on the desktop',
        'user: second, on the phone',
        'assistant: phone answer',
        'user: third, on the phone',
      ]);
    });
  });

  /* XD3: liveness never waits on content. The holder device writes heartbeats while its run is live, paused included. */
  describe('while this device holds a run', () => {
    const workspace = async (): Promise<string> => {
      const root = await mkdtemp(join(tmpdir(), 'tau-chat-heartbeat-'));
      roots.push(root);
      return root;
    };
    const ownLog = (root: string): string => join(root, '.tau', 'chats', chatId, 'events.jsonl');
    const rowsUntil = async (root: string, done: (rows: AgentLogEvent[]) => boolean): Promise<AgentLogEvent[]> => {
      for (let attempt = 0; attempt < 300; attempt++) {
        // oxlint-disable-next-line no-await-in-loop -- polling a durable file is sequential by nature.
        const rows = rowsOf(await readFile(ownLog(root), 'utf8').catch(() => ''));
        if (done(rows)) {
          return rows;
        }
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await sleep(10);
      }
      throw new Error(
        `The rows never arrived: ${JSON.stringify(rowsOf(await readFile(ownLog(root), 'utf8').catch(() => '')).map((row) => [row.type, 'state' in row ? row.state : '']))}`,
      );
    };
    const heartbeatsAfter = (rows: readonly AgentLogEvent[], state: string): AgentLogEvent[] => {
      const from = rows.findIndex((row) => row.type === 'run.lifecycle' && row.state === state);
      return from === -1 ? [] : rows.slice(from + 1).filter((row) => row.type === 'run.heartbeat');
    };

    it('should write a heartbeat and publish the chat while its run streams nothing, then stop once it ends', async () => {
      const root = await workspace();
      const gate = Promise.withResolvers<void>();
      const recorded = recordingModel('answer');
      const published: string[] = [];
      const launcher = launch(
        createNodeChatStore({ workspaceRoot: root }),
        {
          ...recorded.transport,
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            await gate.promise;
            yield* recorded.transport.stream(request);
          },
        },
        {
          runHeartbeat: 20,
          publish: async ({ requestId, chatId: published_ }) => {
            published.push(published_);
            return { requestId, status: 'applied' };
          },
        },
      );
      await launcher.execute({
        type: 'start',
        commandId: key(),
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'go' } },
      });

      const rows = await rowsUntil(root, (found) => heartbeatsAfter(found, 'running').length >= 2);
      expect(heartbeatsAfter(rows, 'running')[0]).toMatchObject({ runId: 'run-1', type: 'run.heartbeat' });
      expect(published).toContain(chatId);

      gate.resolve();
      const ended = await rowsUntil(
        root,
        (found) =>
          heartbeatsAfter(found, 'completed').length > 0 ||
          found.some((row) => row.type === 'run.lifecycle' && row.state === 'completed'),
      );
      await sleep(80);
      const after = rowsOf(await readFile(ownLog(root), 'utf8'));
      expect(ended.some((row) => row.type === 'run.lifecycle' && row.state === 'completed')).toBe(true);
      expect(heartbeatsAfter(after, 'completed')).toEqual([]);
    });

    /* A run that writes a row more often than the heartbeat interval never goes quiet, so it writes no heartbeat: its
     * rows still have to reach the other devices on the heartbeat's cadence, or they see it stale and run beside it. */
    it('should publish a chatty run’s chat at least once every heartbeat interval while it writes rows', async () => {
      const root = await workspace();
      const clock = new SimulatedClock();
      const heartbeatInterval = 60;
      const steps = 24;
      const published: number[] = [];
      let calls = 0;
      const launcher = launch(
        createNodeChatStore({ workspaceRoot: root }),
        {
          funding: { type: 'unfunded' },
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            calls += 1;
            /* Advance only after the preceding call's rows landed, independently of filesystem/worker latency. */
            vi.setSystemTime(Date.now() + 15);
            clock.increment(15);
            if (calls <= steps) {
              yield { type: 'tool-input', toolCallId: `call-${String(calls)}`, toolName: 'missing', input: {} };
              yield { type: 'completed', stopReason: 'toolUse' };
              return;
            }
            yield { type: 'text-delta', text: 'done' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        {
          clock,
          runHeartbeat: heartbeatInterval,
          publish: async ({ requestId }) => {
            published.push(Date.now());
            return { requestId, status: 'applied' };
          },
        },
      );
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const startedAt = Date.now();
        await launcher.execute({
          type: 'start',
          commandId: key(),
          payload: {
            chatId,
            runId: 'run-1',
            trigger: 'submit',
            message: { id: 'user-1', role: 'user', content: 'go' },
          },
        });
        const rows = await rowsUntil(root, (found) =>
          found.some((row) => row.type === 'run.lifecycle' && row.state === 'completed'),
        );
        const completedAt = Date.parse(rows.findLast((row) => row.type === 'run.lifecycle')!.recordedAt);

        const whileLive = published.filter((at) => at < completedAt);
        expect(whileLive.length).toBeGreaterThanOrEqual(2);
        expect(whileLive[0]).toBe(startedAt);
        const gaps = whileLive.slice(1).map((at, index) => at - whileLive[index]!);
        /* Every interval publishes even though rows keep the run from going quiet, including the final partial one. */
        expect(gaps).toEqual(Array.from({ length: gaps.length }, () => heartbeatInterval));
        expect(completedAt - whileLive.at(-1)!).toBeLessThanOrEqual(heartbeatInterval);
        expect(heartbeatsAfter(rows, 'running')).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    /* A heartbeat is for the other devices, and builds older than XD3 read it as an opaque row of the run: where the
     * placement says no other device reads the chat, none is written. */
    it('should write no heartbeat where the placement says the chat reaches no other device', async () => {
      const root = await workspace();
      const gate = Promise.withResolvers<void>();
      const recorded = recordingModel('answer');
      const launcher = launch(
        createNodeChatStore({ workspaceRoot: root }),
        {
          ...recorded.transport,
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            await gate.promise;
            yield* recorded.transport.stream(request);
          },
        },
        {
          runHeartbeat: 20,
          publish: async ({ requestId }) => ({
            requestId,
            status: 'refused',
            code: 'CHAT_NOT_SHARED',
            message: 'No remote.',
          }),
        },
      );
      await launcher.execute({
        type: 'start',
        commandId: key(),
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'go' } },
      });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'running'));

      await sleep(200);
      const rows = rowsOf(await readFile(ownLog(root), 'utf8'));
      gate.resolve();

      expect(heartbeatsAfter(rows, 'running')).toEqual([]);
    });

    /* A heartbeat row is this device's own liveness: only a definite CHAT_NOT_SHARED stops it. A fenced or failing
     * publish leaves sharing unknown, and the rows keep being written and published again, or the run would read as
     * gone on the other devices after the staleness bound of publish trouble. */
    it('should keep writing heartbeats while the placement only fails or refuses the publish', async () => {
      const root = await workspace();
      const gate = Promise.withResolvers<void>();
      const recorded = recordingModel('answer');
      let asked = 0;
      const launcher = launch(
        createNodeChatStore({ workspaceRoot: root }),
        {
          ...recorded.transport,
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            await gate.promise;
            yield* recorded.transport.stream(request);
          },
        },
        {
          runHeartbeat: 20,
          publish: async ({ requestId }) => {
            asked += 1;
            if (asked % 2 === 0) {
              throw new Error('The placement session went away.');
            }
            return { requestId, status: 'refused', code: 'SESSION_FENCED', message: 'Fenced.' };
          },
        },
      );
      await launcher.execute({
        type: 'start',
        commandId: key(),
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'go' } },
      });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'running'));
      await sleep(200);
      const rows = rowsOf(await readFile(ownLog(root), 'utf8'));
      gate.resolve();

      expect(heartbeatsAfter(rows, 'running').length).toBeGreaterThanOrEqual(2);
      expect(asked).toBeGreaterThan(2);
    });

    /* One publish per heartbeat, after its row; an unshared chat is asked once per interval at most, never per tick. */
    it('should publish once per heartbeat, and ask an unshared chat again only once its answer is an interval old', async () => {
      const root = await workspace();
      const gate = Promise.withResolvers<void>();
      const recorded = recordingModel('answer');
      const shared = { now: true };
      const published: Array<Readonly<{ at: number; rows: number }>> = [];
      /* Read synchronously, so a publish and the rows it sees, and the counts at the flip below, are one moment. */
      const rowsNow = () => rowsOf(existsSync(ownLog(root)) ? readFileSync(ownLog(root), 'utf8') : '');
      const launcher = launch(
        createNodeChatStore({ workspaceRoot: root }),
        {
          ...recorded.transport,
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            await gate.promise;
            yield* recorded.transport.stream(request);
          },
        },
        {
          runHeartbeat: 40,
          publish: async ({ requestId }) => {
            published.push({ at: Date.now(), rows: rowsNow().length });
            return shared.now
              ? { requestId, status: 'applied' }
              : { requestId, status: 'refused', code: 'CHAT_NOT_SHARED', message: 'No remote.' };
          },
        },
      );
      await launcher.execute({
        type: 'start',
        commandId: key(),
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'go' } },
      });
      await rowsUntil(root, (found) => heartbeatsAfter(found, 'running').length >= 3);
      const heartbeats = heartbeatsAfter(rowsNow(), 'running').length;
      const whileShared = published.length;
      shared.now = false;
      await sleep(300);
      const after = rowsNow();
      const whileUnshared = published.length - whileShared;
      gate.resolve();

      /* While shared: every heartbeat row is published (after it, by the same tick). Publishes of the run's own rows
       * come on the same cadence; one may carry nothing new, since a row is marked written only once its append has
       * landed, and a publish that already carried it cannot tell. */
      expect(whileShared).toBeGreaterThanOrEqual(heartbeats);
      /* And never two within an interval (40 ms; timers fire late, never early): no probe right before a heartbeat's
       * own publish, and no heartbeat publish right after a publish of the run's rows. */
      const gaps = published
        .slice(0, whileShared)
        .slice(1)
        .map((call, index) => call.at - published[index]!.at);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(30);
      /* Once unshared, at most the one heartbeat whose publish said so, then none. */
      expect(heartbeatsAfter(after, 'running').length - heartbeats).toBeLessThanOrEqual(1);
      /* Asked at most about once an interval while unshared (300 ms at 40 ms), never twice a tick. */
      expect(whileUnshared).toBeLessThanOrEqual(9);
    });

    /* The tick that asks an unshared chat again and hears it is shared now writes its heartbeat then, not a tick later;
     * it still publishes once. */
    /* The tick that asks an unshared chat again and hears it is shared now writes its heartbeat then, not a tick later;
     * it still publishes once. */
    it('should write the heartbeat on the tick whose recheck finds the chat shared', async () => {
      const root = await workspace();
      const gate = Promise.withResolvers<void>();
      const recorded = recordingModel('answer');
      const shared = { now: false };
      const published: Array<Readonly<{ at: number; rows: number; shared: boolean }>> = [];
      const launcher = launch(
        createNodeChatStore({ workspaceRoot: root }),
        {
          ...recorded.transport,
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            await gate.promise;
            yield* recorded.transport.stream(request);
          },
        },
        {
          runHeartbeat: 40,
          publish: async ({ requestId }) => {
            /* Read as the publish is asked, before the next tick can write another row. */
            const rows = rowsOf(existsSync(ownLog(root)) ? readFileSync(ownLog(root), 'utf8') : '');
            published.push({ at: Date.now(), rows: rows.length, shared: shared.now });
            const answer = shared.now;
            return answer
              ? { requestId, status: 'applied' }
              : { requestId, status: 'refused', code: 'CHAT_NOT_SHARED', message: 'No remote.' };
          },
        },
      );
      await launcher.execute({
        type: 'start',
        commandId: key(),
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'go' } },
      });
      /* Past the ask at the run's start and the publishes of its first rows (they can land over a few ticks): two
       * rechecks in a row that found no new row, so every publish from here is a recheck or a heartbeat's. */
      await vi.waitFor(
        () => {
          const [before, last] = published.slice(-2);
          expect(published.length).toBeGreaterThanOrEqual(3);
          expect(last?.rows).toBe(before?.rows);
        },
        { timeout: 3000 },
      );
      shared.now = true;
      await vi.waitFor(
        () => {
          expect(published.filter((call) => call.shared).length).toBeGreaterThanOrEqual(2);
        },
        { timeout: 3000 },
      );
      const rows = rowsOf(await readFile(ownLog(root), 'utf8'));
      gate.resolve();

      const [recheck, next] = published.filter((call) => call.shared);
      /* Milliseconds round both ways: a row stamped in the recheck's millisecond counts as after it. */
      const first = heartbeatsAfter(rows, 'running').find((row) => Date.parse(row.recordedAt) >= recheck!.at - 1);
      /*
       * Its row lands on the recheck's own tick, so the next publish comes a timer's interval (40 ms) after it; a row
       * written only by the next tick would be published by that tick at once. Load only lengthens the interval.
       */
      expect(first).toBeDefined();
      expect(next!.at - Date.parse(first!.recordedAt)).toBeGreaterThanOrEqual(30);
    });

    /** A run on this device paused on an approval, its stream answering nothing until the pause aborts it. */
    const pausedRun = async (options: Parameters<typeof launch>[2]): Promise<string> => {
      const { root } = await pausedRunOn(options);
      return root;
    };
    const pausedRunOn = async (
      options: Parameters<typeof launch>[2],
    ): Promise<Readonly<{ root: string; launcher: AgentLauncher }>> => {
      const root = await workspace();
      const launcher = launch(
        createNodeChatStore({ workspaceRoot: root }),
        {
          ...recordingModel('answer').transport,
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            await new Promise((resolve) => {
              request.signal.addEventListener('abort', resolve, { once: true });
            });
            yield { type: 'completed', stopReason: 'aborted' };
          },
        },
        options,
      );
      await launcher.execute({
        type: 'start',
        commandId: key(),
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'go' } },
      });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'running'));
      await launcher.execute({
        type: 'interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', kind: 'approval', prompt: 'Write?' },
      });
      return { root, launcher };
    };
    const heartbeatCount = async (root: string): Promise<number> =>
      heartbeatsAfter(rowsOf(await readFile(ownLog(root), 'utf8')), 'paused').length;

    /**
     * A run on this device paused on an approval, on a store whose segment reads never return once the stall is armed
     * (an offline cloud placeholder, a stale mount): a segment read is bounded at 100 ms.
     */
    const stalledPausedRun = async (): Promise<
      Readonly<{ root: string; stall: { armed: boolean }; launcher: AgentLauncher }>
    > => {
      const root = await workspace();
      const store = createNodeChatStore({ workspaceRoot: root });
      const stall = { armed: false };
      const binding = chatStoreBinding(store) as { openWriter: (id: string) => Promise<EventLogAppender> };
      const open = binding.openWriter;
      binding.openWriter = async (id) => {
        const log = await open(id);
        const { refresh } = log;
        return refresh === undefined
          ? log
          : Object.assign(log, {
              refresh: async () => {
                if (stall.armed) {
                  await new Promise<never>(() => {
                    /* A read that never returns. */
                  });
                }
                await refresh.call(log);
              },
            });
      };
      const launcher = launch(
        store,
        {
          ...recordingModel('answer').transport,
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            await new Promise((resolve) => {
              request.signal.addEventListener('abort', resolve, { once: true });
            });
            yield { type: 'completed', stopReason: 'aborted' };
          },
        },
        { segmentRefresh: 100 },
      );
      await launcher.execute({
        type: 'start',
        commandId: key(),
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'go' } },
      });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'running'));
      await launcher.execute({
        type: 'interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', kind: 'approval', prompt: 'Write?' },
      });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'turn.finalized'));
      await vi.waitFor(() => {
        expect(quiescentChats.get(launcher)?.has(chatId)).toBe(true);
      });
      return { root, stall, launcher };
    };

    /*
     * Round 26: every admission's segment read is bounded, a start's and a Resume's as an approval's. A start whose
     * read never returns is refused `SEGMENTS_UNREADABLE` (`wait`) at the bound and releases the chat's dispatch turn,
     * so the approval behind it reaches its own bound, and once the segments read again the approval is applied.
     */
    it('should refuse a start whose segment read never returns at the bound, and let the commands behind it on', async () => {
      const { stall, launcher } = await stalledPausedRun();
      stall.armed = true;

      const started = launcher.execute({
        type: 'start',
        commandId: key(),
        payload: {
          chatId,
          runId: 'run-2',
          trigger: 'submit',
          message: { id: 'user-2', role: 'user', content: 'again' },
        },
      });
      const approved = launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      });
      const refusedStart = await started;
      const refusedApproval = await approved;
      stall.armed = false;
      const applied = await launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      });

      expect(refusedStart, JSON.stringify(refusedStart)).toMatchObject({
        status: 'refused',
        code: 'SEGMENTS_UNREADABLE',
      });
      expect(refusedApproval, JSON.stringify(refusedApproval)).toMatchObject({
        status: 'refused',
        code: 'SEGMENTS_UNREADABLE',
      });
      expect(applied, JSON.stringify(applied)).toMatchObject({ status: 'applied' });
    }, 5000);

    /*
     * A Stop is applied at once, never behind another command's checks: an Approve whose read of the other devices'
     * segments stalls is refused once it is superseded, and the run stops.
     */
    it('should stop the run at once and refuse an Approve stalled behind its segment read', async () => {
      const { stall, launcher } = await stalledPausedRun();
      stall.armed = true;

      const approve = launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      });
      const stopped = await launcher.execute({ type: 'cancel', commandId: key(), payload: { chatId, runId: 'run-1' } });
      const approved = await approve;

      expect(stopped, JSON.stringify(stopped)).toMatchObject({ status: 'applied' });
      expect(approved, JSON.stringify(approved)).toMatchObject({ status: 'refused', code: 'COMMAND_SUPERSEDED' });
    }, 10_000);

    /* A heartbeat never opens a term: an old paused chat that is only reopened writes nothing, and pushes nothing. */
    it('should write no heartbeat for a paused run a new incarnation only reopens', async () => {
      const { root, launcher } = await pausedRunOn({ runHeartbeat: 20 });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'paused'));
      await launcher.close();
      const before = rowsOf(await readFile(ownLog(root), 'utf8')).length;
      const published: string[] = [];
      const reopened = launch(createNodeChatStore({ workspaceRoot: root }), recordingModel('answer').transport, {
        runHeartbeat: 20,
        publish: async ({ requestId, chatId: chat }) => {
          published.push(chat);
          return { requestId, status: 'applied' };
        },
      });
      /* A send while the run is paused opens the chat's incarnation and is refused: the paused run holds the chat. */
      const refused = await reopened.execute({
        type: 'start',
        commandId: key(),
        payload: {
          chatId,
          runId: 'run-2',
          trigger: 'submit',
          message: { id: 'user-2', role: 'user', content: 'again' },
        },
      });
      expect(refused).toMatchObject({ status: 'refused' });
      await sleep(200);

      expect(
        rowsOf(await readFile(ownLog(root), 'utf8'))
          .slice(before)
          .map((row) => row.type),
      ).not.toContain('run.heartbeat');
      expect(published).toEqual([]);
    });

    /* A forgotten pause holds the chat for a bounded time, then its device stops writing and the fence lets go. */
    it('should stop a paused run’s heartbeats once its hold is over', async () => {
      /* Records when the heartbeat was last armed (an interval of at most `runHeartbeat`): its row lands in the file a
       * few ticks before the write re-arms it, and a clock step taken in between would arm the next heartbeat past
       * every later step, so none would ever fire. */
      class ArmedClock extends SimulatedClock {
        public armedAt = -1;
        public override setTimeout(callback: (...arguments_: unknown[]) => void, delayMilliseconds: number): number {
          if (delayMilliseconds <= 10) {
            this.armedAt = this.now();
          }
          return super.setTimeout(callback, delayMilliseconds);
        }
      }
      const clock = new ArmedClock();
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const { root } = await pausedRunOn({ clock, runHeartbeat: 10, pausedRunHold: 120, publish: sharedPublish });
        await rowsUntil(root, (found) => found.some((row) => row.type === 'turn.finalized'));
        const advance = (milliseconds: number): void => {
          vi.setSystemTime(Date.now() + milliseconds);
          clock.increment(milliseconds);
        };
        const armed = async (): Promise<void> => {
          for (let attempt = 0; attempt < 300 && clock.armedAt !== clock.now(); attempt++) {
            // oxlint-disable-next-line no-await-in-loop -- polling for the host's re-arm is sequential by nature.
            await sleep(10);
          }
          expect(clock.armedAt).toBe(clock.now());
        };
        /* Wait for each real filesystem append before advancing the next interval. Worker starvation cannot
         * consume the whole hold before the first scheduled callback gets CPU time. */
        for (let count = 1; count <= 2; count++) {
          // oxlint-disable-next-line no-await-in-loop -- the heartbeat must be armed before the clock steps over it.
          await armed();
          advance(20);
          // oxlint-disable-next-line no-await-in-loop -- each heartbeat must land before the next clock step.
          await rowsUntil(root, (found) => heartbeatsAfter(found, 'paused').length >= count);
        }
        advance(300);
        const settled = await heartbeatCount(root);
        advance(150);
        expect(await heartbeatCount(root)).toBe(settled);
        expect(settled).toBeGreaterThanOrEqual(2);
        expect(settled).toBeLessThan(20);
      } finally {
        vi.useRealTimers();
      }
    });

    /* An evicted incarnation's log is closed: no heartbeat reopens it. */
    it('should write no heartbeat once the paused run’s incarnation has closed its log', async () => {
      const root = await pausedRun({ runHeartbeat: 30, idleEviction: 50 });
      await sleep(250);
      const settled = await heartbeatCount(root);
      await sleep(150);

      expect(await heartbeatCount(root)).toBe(settled);
    });

    /*
     * Past its hold a paused run stops holding the chat, and another device may run it. The person's later approval
     * would continue the paused run beside that one, so it is refused while another device holds the chat, and the
     * paused run stays as it was.
     */
    it('should refuse to continue a paused run on an approval while another device runs the chat', async () => {
      const { root, launcher } = await pausedRunOn({ runHeartbeat: 10, pausedRunHold: 30 });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'paused'));
      await sleep(100);
      const recordedAt = new Date().toISOString();
      const foreign = (sequence: number, state: string): string =>
        `${JSON.stringify({ version: 1, leaderEpoch: 'phone', sequence, recordedAt, runId: 'run-phone', type: 'run.lifecycle', state })}\n`;
      const segments = join(root, '.tau', 'chats', chatId, 'events');
      await mkdir(segments, { recursive: true });
      await writeFile(join(segments, 'device-phone.jsonl'), foreign(0, 'admitted') + foreign(1, 'running'));
      const before = rowsOf(await readFile(ownLog(root), 'utf8')).length;

      const answer = await launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      });

      expect(answer).toMatchObject({
        status: 'refused',
        code: 'RUN_ACTIVE_ON_ANOTHER_DEVICE',
        effect: 'not-applied',
        details: { deviceId: 'device-phone', runId: 'run-phone' },
      });
      const after = rowsOf(await readFile(ownLog(root), 'utf8')).slice(before);
      expect(after.filter((row) => row.type !== 'run.heartbeat')).toEqual([]);
    });

    /* A Stop sent right after an Approve still checking its fence is applied at once, and the Approve is not run. */
    it('should supersede an Approve still checking its fence when a Stop arrives', async () => {
      const { root, launcher } = await pausedRunOn({ runHeartbeat: 10, pausedRunHold: 60_000 });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'turn.finalized'));
      /* Past the pause's own settlement, so the Stop meets the paused run, not a settling one. */
      await sleep(100);

      const approve = launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      });
      const stop = launcher.execute({ type: 'cancel', commandId: key(), payload: { chatId, runId: 'run-1' } });
      const approved = await approve;
      const stopped = await stop;

      expect(stopped, JSON.stringify(stopped)).toMatchObject({ status: 'applied' });
      expect(approved, JSON.stringify(approved)).toMatchObject({ status: 'refused', code: 'COMMAND_SUPERSEDED' });
    });

    /*
     * Round 22, finding 3: inside its own hold the paused run was approved without the takeover check while another
     * device's segment could not be read. That device judges this run abandoned on its own pulls, after the bound with
     * no new row on the remote, and this device cannot know its heartbeats reached it: the hold outlives that bound, so
     * the takeover the unread segment may hold went unchecked. The approval is refused retryably, and applied once the
     * segment reads.
     */
    it('should refuse an approval, retryably, while another device’s segment cannot be read, even inside the paused run’s hold', async () => {
      const { root, launcher } = await pausedRunOn({ runHeartbeat: 10, pausedRunHold: 60_000 });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'paused'));
      const unreadable = join(root, '.tau', 'chats', chatId, 'events', 'device-phone.jsonl');
      await mkdir(unreadable, { recursive: true });
      const before = rowsOf(await readFile(ownLog(root), 'utf8')).length;
      const approve = {
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      } as const;

      const refused = await launcher.execute(approve);

      expect(refused).toMatchObject({ status: 'refused', code: 'SEGMENTS_UNREADABLE', effect: 'not-applied' });
      expect(refusalOf('SEGMENTS_UNREADABLE').retry).toBe('wait');
      const after = rowsOf(await readFile(ownLog(root), 'utf8')).slice(before);
      expect(after.filter((row) => row.type !== 'run.heartbeat')).toEqual([]);
      await rm(unreadable, { recursive: true });
      await expect(launcher.execute(approve)).resolves.toMatchObject({ status: 'applied' });
    });

    /*
     * A native pause has no driver: its attempt ended at the pause (TS-R10). An approval only records the answer; the
     * turn goes on through a resume, which reads the history again, merged with what another device ran meanwhile.
     */
    it('should continue a paused run approved after another device’s turn on the merged history', async () => {
      const root = await workspace();
      const requests: ModelStreamRequest[] = [];
      let approved = false;
      const launcher = launch(
        createNodeChatStore({ workspaceRoot: root }),
        {
          funding: { type: 'unfunded' },
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            if (!approved) {
              await new Promise((resolve) => {
                request.signal.addEventListener('abort', resolve, { once: true });
              });
              yield { type: 'completed', stopReason: 'aborted' };
              return;
            }
            yield { type: 'text-delta', text: 'continued' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        { runHeartbeat: 10, pausedRunHold: 30 },
      );
      await launcher.execute({
        type: 'start',
        commandId: key(),
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'go' } },
      });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'running'));
      await launcher.execute({
        type: 'interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', kind: 'approval', prompt: 'Write?' },
      });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'paused'));
      /* Past the hold, the phone ran a whole turn on the chat; sync brought its segment here. */
      const at = new Date(Date.now() + 1000).toISOString();
      const phone = (sequence: number, body: Record<string, unknown>): string =>
        `${JSON.stringify({ version: 1, leaderEpoch: 'phone', sequence, recordedAt: at, runId: 'run-phone', ...body })}\n`;
      const segments = join(root, '.tau', 'chats', chatId, 'events');
      await mkdir(segments, { recursive: true });
      await writeFile(
        join(segments, 'device-phone.jsonl'),
        phone(0, { type: 'run.lifecycle', state: 'admitted' }) +
          phone(1, {
            type: 'message.appended',
            message: { id: 'phone-user', role: 'user', content: 'from the phone' },
          }) +
          phone(2, { type: 'run.lifecycle', state: 'completed' }),
      );

      approved = true;
      const approval = await launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      });
      expect(approval).toMatchObject({ status: 'applied' });
      const resumed = await launcher.execute({
        type: 'resume',
        commandId: key(),
        payload: { chatId, runId: 'run-1' },
      });
      expect(resumed).toMatchObject({ status: 'applied' });
      await rowsUntil(root, (found) =>
        found.some((row) => row.runId === 'run-1' && row.type === 'run.lifecycle' && row.state === 'completed'),
      );

      expect(transcriptOf(requests.at(-1))).toContain('user: from the phone');
    });

    /*
     * Round 17: an approval continues the paused run, so it is admitted as a Resume is. Once another device found the
     * run abandoned, said its turn and went on, the approved tool would act on a project that device changed: the
     * approval is refused, typed, before any row.
     */
    it('should refuse an approval of a paused run another device took over', async () => {
      const { root, launcher } = await pausedRunOn({ runHeartbeat: 10, pausedRunHold: 30 });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'paused'));
      const at = new Date(Date.now() + 1000).toISOString();
      const phone = (sequence: number, runId: string, body: Record<string, unknown>): string =>
        `${JSON.stringify({ version: 1, leaderEpoch: 'phone', sequence, recordedAt: at, runId, ...body })}\n`;
      const segments = join(root, '.tau', 'chats', chatId, 'events');
      await mkdir(segments, { recursive: true });
      await writeFile(
        join(segments, 'device-phone.jsonl'),
        phone(0, 'run-1', {
          type: 'message.appended',
          message: {
            id: 'user-1',
            role: 'user',
            content: 'go',
            metadata: { tauInternal: { kind: 'abandoned-turn' } },
          },
        }) +
          phone(1, 'run-phone', { type: 'run.lifecycle', state: 'admitted' }) +
          phone(2, 'run-phone', { type: 'run.lifecycle', state: 'completed' }),
      );
      const before = rowsOf(await readFile(ownLog(root), 'utf8')).length;

      const answer = await launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      });

      expect(answer).toMatchObject({ status: 'refused', code: 'RUN_TAKEN_OVER', effect: 'not-applied' });
      expect(refusalOf('RUN_TAKEN_OVER').retry).toBe('never');
      const after = rowsOf(await readFile(ownLog(root), 'utf8')).slice(before);
      expect(after.filter((row) => row.type !== 'run.heartbeat')).toEqual([]);
      /* A denial ends the paused run, and is never refused. */
      const denied = await launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'denied' },
      });
      expect(denied).toMatchObject({ status: 'applied' });
    });

    /*
     * Round 17: an approval admitted after another device's turn writes under a new term, as a Resume does, so its rows
     * merge after that turn on every device instead of under the paused run's old term, ahead of it.
     */
    it('should write an approval after another device’s turn under a new term', async () => {
      const { root, launcher } = await pausedRunOn({ runHeartbeat: 10, pausedRunHold: 30 });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'paused'));
      const at = new Date(Date.now() + 1000).toISOString();
      const phone = (sequence: number, body: Record<string, unknown>): string =>
        `${JSON.stringify({ version: 1, leaderEpoch: 'phone', sequence, recordedAt: at, runId: 'run-phone', ...body })}\n`;
      const segments = join(root, '.tau', 'chats', chatId, 'events');
      await mkdir(segments, { recursive: true });
      await writeFile(
        join(segments, 'device-phone.jsonl'),
        phone(0, { type: 'run.lifecycle', state: 'admitted' }) +
          phone(1, {
            type: 'message.appended',
            message: { id: 'phone-user', role: 'user', content: 'from the phone' },
          }) +
          phone(2, { type: 'run.lifecycle', state: 'completed' }),
      );

      const approval = await launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      });

      expect(approval).toMatchObject({ status: 'applied' });
      const rows = rowsOf(await readFile(ownLog(root), 'utf8'));
      const paused = rows.find((row) => row.type === 'run.lifecycle' && row.state === 'paused');
      const resolved = rows.find((row) => row.type === 'interrupt.recorded' && row.phase === 'resolved');
      expect(resolved?.leaderEpoch).toBeDefined();
      expect(resolved?.leaderEpoch).not.toBe(paused?.leaderEpoch);
      expect(Date.parse(resolved!.recordedAt)).toBeGreaterThan(Date.parse(at));
    });

    /** The desktop's run, admitted and running and never settled, with pulls that found its segment quiet past the bound. */
    const abandonedDesktopRun = async (root: string): Promise<void> => {
      const at = new Date().toISOString();
      const desktop = (sequence: number, body: Record<string, unknown>): string =>
        `${JSON.stringify({ version: 1, leaderEpoch: 'desktop', sequence, recordedAt: at, runId: 'run-desktop', ...body })}\n`;
      const segments = join(root, '.tau', 'chats', chatId, 'events');
      await mkdir(segments, { recursive: true });
      const bytes =
        desktop(0, {
          type: 'run.lifecycle',
          state: 'admitted',
          admission: {
            kind: 'tau',
            trigger: 'submit',
            turnId: 'desktop-user',
            message: { id: 'desktop-user', role: 'user', content: 'from the desktop' },
          },
        }) + desktop(1, { type: 'run.lifecycle', state: 'running' });
      await writeFile(join(segments, 'device-desktop.jsonl'), bytes);
      await writeFile(
        join(segments, 'pulled-at'),
        `${String(Date.now())}\ndevice-desktop.jsonl ${String(Buffer.byteLength(bytes))} ${String(foreignRunStaleMilliseconds + 1)}`,
      );
    };
    /** The person's turn of the desktop's run, said in this device's log, and the row right after it. */
    const saidDesktopTurn = (
      rows: readonly AgentLogEvent[],
    ): Readonly<{ said?: AgentLogEvent; next?: AgentLogEvent }> => {
      const index = rows.findIndex((row) => row.type === 'message.appended' && row.runId === 'run-desktop');
      return index === -1 ? {} : { said: rows[index], next: rows[index + 1] };
    };

    /*
     * Round 20: every command that goes on past another device's abandoned run says that run's turn in its first batch,
     * not only a start. An approval that continues a paused run past it marks it taken over, so that device's own
     * approval of it is refused and its person's words stay in every history.
     */
    it('should say an abandoned foreign run’s turn in the first batch of an approval that goes on past it', async () => {
      const { root, launcher } = await pausedRunOn({ runHeartbeat: 10, pausedRunHold: 30 });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'paused'));
      await sleep(100);
      await abandonedDesktopRun(root);

      const approval = await launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      });

      expect(approval, JSON.stringify(approval)).toMatchObject({ status: 'applied' });
      const { said, next } = saidDesktopTurn(rowsOf(await readFile(ownLog(root), 'utf8')));
      expect(said).toMatchObject({
        message: { id: 'desktop-user', metadata: { tauInternal: { kind: 'abandoned-turn' } } },
      });
      expect(next).toMatchObject({
        type: 'interrupt.recorded',
        phase: 'resolved',
        runId: 'run-1',
        leaderEpoch: said!.leaderEpoch,
      });
    });

    it('should say an abandoned foreign run’s turn in the first batch of a Resume that goes on past it', async () => {
      const { root, launcher } = await pausedRunOn({ runHeartbeat: 10, pausedRunHold: 30 });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'paused'));
      const approval = await launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      });
      expect(approval, JSON.stringify(approval)).toMatchObject({ status: 'applied' });
      await abandonedDesktopRun(root);
      const before = rowsOf(await readFile(ownLog(root), 'utf8')).length;

      const resumed = await vi.waitFor(
        async () => {
          const answer = await launcher.execute({
            type: 'resume',
            commandId: key(),
            payload: { chatId, runId: 'run-1' },
          });
          expect(answer, JSON.stringify(answer)).toMatchObject({ status: 'applied' });
          return answer;
        },
        { timeout: 3000, interval: 20 },
      );

      expect(resumed).toMatchObject({ status: 'applied' });
      const rows = await rowsUntil(root, (found) =>
        found.slice(before).some((row) => row.type === 'run.lifecycle' && row.state === 'running'),
      );
      const { said, next } = saidDesktopTurn(rows.slice(before));
      expect(said).toMatchObject({
        message: { id: 'desktop-user', metadata: { tauInternal: { kind: 'abandoned-turn' } } },
      });
      expect(next).toMatchObject({
        type: 'run.lifecycle',
        state: 'running',
        runId: 'run-1',
        leaderEpoch: said!.leaderEpoch,
      });
    });

    /*
     * Round 19: a command refused after its term check leaves no trace. A new term opens with the first row written
     * under it, so a Send refused while the run is live, or an approval of no pending request, never moves the chat's
     * term away from the one its paused run wrote under, and the run keeps writing heartbeats under it.
     */
    it.each([
      [
        'a Send refused while the run is live',
        {
          type: 'start',
          payload: {
            chatId,
            runId: 'run-2',
            trigger: 'submit',
            message: { id: 'user-2', role: 'user', content: 'again' },
          },
        },
      ],
      [
        'an approval of no pending request',
        {
          type: 'resolve-interrupt',
          payload: { chatId, runId: 'run-1', interruptId: 'int-unknown', outcome: 'approved' },
        },
      ],
    ] as const)('should keep a paused run’s heartbeats under its own term after %s', async (_name, command) => {
      const { root, launcher } = await pausedRunOn({ runHeartbeat: 20, publish: sharedPublish });
      await rowsUntil(root, (found) => heartbeatsAfter(found, 'paused').length > 0);
      const at = new Date(Date.now() + 1000).toISOString();
      const phone = (sequence: number, body: Record<string, unknown>): string =>
        `${JSON.stringify({ version: 1, leaderEpoch: 'phone', sequence, recordedAt: at, runId: 'run-phone', ...body })}\n`;
      const segments = join(root, '.tau', 'chats', chatId, 'events');
      await mkdir(segments, { recursive: true });
      await writeFile(
        join(segments, 'device-phone.jsonl'),
        phone(0, { type: 'run.lifecycle', state: 'admitted' }) +
          phone(1, { type: 'run.lifecycle', state: 'completed' }),
      );

      const answer = await launcher.execute({ ...command, commandId: key() } as Parameters<
        AgentLauncher['execute']
      >[0]);

      expect(answer, JSON.stringify(answer)).toMatchObject({ status: 'refused' });
      const refusedAt = rowsOf(await readFile(ownLog(root), 'utf8')).length;
      const rows = await rowsUntil(
        root,
        (found) => found.slice(refusedAt).filter((row) => row.type === 'run.heartbeat').length >= 2,
      );
      const paused = rows.find((row) => row.type === 'run.lifecycle' && row.state === 'paused');
      expect(rows.slice(refusedAt).map((row) => [row.type, row.leaderEpoch])).toEqual(
        rows.slice(refusedAt).map(() => ['run.heartbeat', paused?.leaderEpoch]),
      );
    });

    it('should keep a paused run alive with heartbeats while its session is open here', async () => {
      const root = await workspace();
      /* A stream that answers nothing until the pause aborts it. */
      const launcher = launch(
        createNodeChatStore({ workspaceRoot: root }),
        {
          ...recordingModel('answer').transport,
          async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
            await new Promise((resolve) => {
              request.signal.addEventListener('abort', resolve, { once: true });
            });
            yield { type: 'completed', stopReason: 'aborted' };
          },
        },
        { runHeartbeat: 20, publish: sharedPublish },
      );
      await launcher.execute({
        type: 'start',
        commandId: key(),
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'go' } },
      });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'running'));
      await launcher.execute({
        type: 'interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', kind: 'approval', prompt: 'Write?' },
      });

      const rows = await rowsUntil(root, (found) => heartbeatsAfter(found, 'paused').length >= 2);

      expect(heartbeatsAfter(rows, 'paused')[0]).toMatchObject({ runId: 'run-1' });
    });
  });

  describe('on the browser host', () => {
    /** The provider filesystem, with the directory listing a bridge gives (`FileSystemClient.readdir`). */
    const listingFileSystem = (): MemoryFileSystem => {
      const fileSystem = memoryFileSystem();
      return {
        ...fileSystem,
        readdir: async (path) => {
          const prefix = `${path}/`;
          const names = [...fileSystem.files.keys()]
            .filter((file) => file.startsWith(prefix))
            .map((file) => file.slice(prefix.length).split('/')[0]!);
          if (names.length === 0) {
            throw Object.assign(new Error(`${path} does not exist.`), { code: 'ENOENT' });
          }
          return [...new Set(names)];
        },
      };
    };
    const store = (fileSystem: MemoryFileSystem, tabId: string): ChatStore =>
      createBrowserChatStore({
        projectId: 'project-1',
        tabId,
        build: 'build-1',
        log: { kind: 'provider', fileSystem },
      });
    const ownLog = `.tau/chats/${chatId}/events.jsonl`;

    it('should give the model both devices’ turns in merged order', async () => {
      const desktop = listingFileSystem();
      const phone = listingFileSystem();
      const desktopModel = recordingModel('desktop answer');
      const phoneModel = recordingModel('phone answer');
      const onDesktop = launch(store(desktop, 'desktop-tab'), desktopModel.transport);
      await turn(onDesktop, 'run-desktop-1', 'first, on the desktop');

      phone.files.set(`.tau/chats/${chatId}/events/device-desktop.jsonl`, desktop.files.get(ownLog)!);
      const onPhone = launch(store(phone, 'phone-tab'), phoneModel.transport);
      await turn(onPhone, 'run-phone-1', 'second, on the phone');

      expect(transcriptOf(phoneModel.requests.at(-1))).toEqual([
        'user: first, on the desktop',
        'assistant: desktop answer',
        'user: second, on the phone',
      ]);
      const own = rowsOf(phone.files.get(ownLog)!);
      expect(new Set(own.map((row) => row.runId))).toEqual(new Set(['run-phone-1']));
    });

    /* A segment read is one provider round trip: a missing file is the read's `ENOENT`, never an `exists` first. */
    it('should read the other devices’ segments without asking whether each one exists', async () => {
      const phone = listingFileSystem();
      const asked: string[] = [];
      const { exists } = phone;
      phone.exists = async (path) => {
        asked.push(path);
        return exists(path);
      };
      phone.files.set(`.tau/chats/${chatId}/events/device-desktop.jsonl`, new TextEncoder().encode(''));
      const onPhone = launch(store(phone, 'phone-tab'), recordingModel('phone answer').transport);

      await turn(onPhone, 'run-phone-1', 'on the phone');

      expect(asked.filter((path) => path.includes('/events/'))).toEqual([]);
    });

    describe('when a segment read never returns', () => {
      /** A provider whose listing of the chat's `events/` directory never answers once the stall is armed. */
      const stallingFileSystem = (): Readonly<{ fileSystem: MemoryFileSystem; stall: { armed: boolean } }> => {
        const fileSystem = listingFileSystem();
        const stall = { armed: false };
        const { readdir } = fileSystem;
        return {
          stall,
          fileSystem: {
            ...fileSystem,
            readdir: async (path) => {
              if (stall.armed && path.endsWith(`/${chatId}/events`)) {
                await new Promise<never>(() => {
                  /* A provider round trip that never returns. */
                });
              }
              return readdir!(path);
            },
          },
        };
      };
      const pausing: ModelTransport = {
        ...recordingModel('answer').transport,
        async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
          await new Promise((resolve) => {
            request.signal.addEventListener('abort', resolve, { once: true });
          });
          yield { type: 'completed', stopReason: 'aborted' };
        },
      };
      const rowsIn = (fileSystem: MemoryFileSystem): AgentLogEvent[] =>
        rowsOf(fileSystem.files.get(ownLog) ?? new Uint8Array());
      /** A run paused on an approval on this tab, its segments read once, with a segment read bounded at 100 ms. */
      const pausedOn = async (fileSystem: MemoryFileSystem): Promise<AgentLauncher> => {
        const launcher = launch(store(fileSystem, 'tab-1'), pausing, { segmentRefresh: 100 });
        await launcher.execute({
          type: 'start',
          commandId: key(),
          payload: {
            chatId,
            runId: 'run-1',
            trigger: 'submit',
            message: { id: 'user-1', role: 'user', content: 'go' },
          },
        });
        await vi.waitFor(() => {
          expect(rowsIn(fileSystem).some((row) => row.type === 'run.lifecycle' && row.state === 'running')).toBe(true);
        });
        await launcher.execute({
          type: 'interrupt',
          commandId: key(),
          payload: { chatId, runId: 'run-1', interruptId: 'int-1', kind: 'approval', prompt: 'Write?' },
        });
        await vi.waitFor(() => {
          expect(rowsIn(fileSystem).some((row) => row.type === 'turn.finalized')).toBe(true);
        });
        return launcher;
      };
      const resolvedIn = (fileSystem: MemoryFileSystem): boolean =>
        rowsIn(fileSystem).some((row) => row.type === 'interrupt.recorded' && row.phase === 'resolved');
      const settledRun1 = (fileSystem: MemoryFileSystem): string | undefined =>
        rowsIn(fileSystem)
          .filter((row) => row.type === 'run.lifecycle' && row.runId === 'run-1')
          .map((row) => (row.type === 'run.lifecycle' ? row.state : ''))
          .find((state) => state === 'cancelled' || state === 'failed' || state === 'completed');

      /*
       * Round 27: the bound stops the read, not only the wait. A read that never returns runs outside the log's write
       * queue, so an Approve refused at the bound leaves the queue free and the Stop behind it still applies.
       */
      it('should apply a Stop within the bound after an Approve whose segment read hung', async () => {
        const { fileSystem, stall } = stallingFileSystem();
        const launcher = await pausedOn(fileSystem);
        stall.armed = true;

        const approved = await launcher.execute({
          type: 'resolve-interrupt',
          commandId: key(),
          payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
        });
        const stopped = await launcher.execute({
          type: 'cancel',
          commandId: key(),
          payload: { chatId, runId: 'run-1' },
        });

        expect(approved, JSON.stringify(approved)).toMatchObject({ status: 'refused', code: 'SEGMENTS_UNREADABLE' });
        expect(stopped, JSON.stringify(stopped)).toMatchObject({ status: 'applied' });
        await vi.waitFor(() => {
          expect(settledRun1(fileSystem)).toBe('cancelled');
        });
      }, 3000);

      it('should apply a denial within the bound after an Approve whose segment read hung', async () => {
        const { fileSystem, stall } = stallingFileSystem();
        const launcher = await pausedOn(fileSystem);
        stall.armed = true;

        const approved = await launcher.execute({
          type: 'resolve-interrupt',
          commandId: key(),
          payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
        });
        const denied = await launcher.execute({
          type: 'resolve-interrupt',
          commandId: key(),
          payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'denied' },
        });

        expect(approved, JSON.stringify(approved)).toMatchObject({ status: 'refused', code: 'SEGMENTS_UNREADABLE' });
        expect(denied, JSON.stringify(denied)).toMatchObject({ status: 'applied' });
        await vi.waitFor(() => {
          expect(resolvedIn(fileSystem)).toBe(true);
        });
      }, 3000);

      /*
       * Opening reads the segments under the same bound: a chat whose segments never answer opens with them unread,
       * and a start is refused `SEGMENTS_UNREADABLE` (`wait`) at the bound.
       */
      it('should open a chat whose segment read hangs and refuse a start at the bound', async () => {
        const { fileSystem, stall } = stallingFileSystem();
        await turn(launch(store(fileSystem, 'tab-1'), recordingModel('answer').transport), 'run-1', 'first');
        await launchers.pop()!.close();
        stall.armed = true;
        const reopened = launch(store(fileSystem, 'tab-2'), recordingModel('answer').transport, {
          segmentRefresh: 100,
        });

        const started = await reopened.execute({
          type: 'start',
          commandId: key(),
          payload: {
            chatId,
            runId: 'run-2',
            trigger: 'submit',
            message: { id: 'user-2', role: 'user', content: 'again' },
          },
        });

        expect(started, JSON.stringify(started)).toMatchObject({ status: 'refused', code: 'SEGMENTS_UNREADABLE' });
      }, 3000);

      /* A Stop of a paused run on a chat whose segments never answer opens the chat and applies, within the bound. */
      it('should apply a Stop on a reopened chat whose segment read hangs', async () => {
        const { fileSystem, stall } = stallingFileSystem();
        const first = await pausedOn(fileSystem);
        await first.close();
        stall.armed = true;
        const reopened = launch(store(fileSystem, 'tab-2'), pausing, { segmentRefresh: 100 });

        const stopped = await reopened.execute({
          type: 'cancel',
          commandId: key(),
          payload: { chatId, runId: 'run-1' },
        });

        expect(stopped, JSON.stringify(stopped)).toMatchObject({ status: 'applied' });
        await vi.waitFor(() => {
          expect(settledRun1(fileSystem)).toBe('cancelled');
        });
      }, 3000);
    });
  });
});
