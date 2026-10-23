/**
 * A chat two devices have written (XD1): this device appends to its own `events.jsonl`, and sync projects every other
 * device's log beside it as `events/<deviceId>.jsonl`. The model's next turn has to see both devices' turns, in merged
 * order, on every host; the writer still appends only to its own file, and run bookkeeping reads only its own rows.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserChatStore } from '#browser.js';
import { memoryFileSystem } from '#browser/leadership.fixture.js';
import type { MemoryFileSystem } from '#browser/leadership.fixture.js';
import { fakePlacement } from '#host/tau-agent-host.fixture.js';
import { createAgentLauncher } from '#launchers/agent-launcher.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import { chatStoreBinding } from '#launchers/chat-store.js';
import type { ChatStore } from '#launchers/chat-store.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import type { AgentLogEvent, ProviderMessage } from '#log/event-types.js';
import { foreignRunStaleMilliseconds } from '#log/foreign-runs.js';
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
    publish?: NonNullable<TurnPlacementPort['publish']>;
  }> = {},
): AgentLauncher => {
  const placement = fakePlacement({ registry: emptyTools }).port;
  const launcher = createAgentLauncher({
    chats,
    modelTransport: transport,
    credential: () => ({ mode: 'session' }),
    model,
    systemPrompt: 'You are Tau.',
    toolRegistry: emptyTools,
    turnPlacement: options.publish === undefined ? placement : { ...placement, publish: options.publish },
    delays: {
      ...(options.runHeartbeat === undefined ? {} : { runHeartbeat: options.runHeartbeat }),
      ...(options.pausedRunHold === undefined ? {} : { pausedRunHold: options.pausedRunHold }),
      ...(options.idleEviction === undefined ? {} : { idleEviction: options.idleEviction }),
    },
  });
  launchers.push(launcher);
  return launcher;
};

let keys = 0;
const key = (): string => {
  keys += 1;
  return `cmd-${String(keys)}`;
};

/** Wait until a run completes. */
const settleRun = async (launcher: AgentLauncher, runId: string): Promise<HostRunSnapshot> => {
  for (let attempt = 0; attempt < 300; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- polling a durable projection is sequential by nature.
    const attached = await launcher.execute({ type: 'attach', commandId: key(), payload: { chatId } });
    const snapshot =
      attached.status === 'applied' && attached.effect === 'not-applied'
        ? (attached.details as { readonly snapshot?: HostRunSnapshot }).snapshot
        : undefined;
    if (snapshot?.runId === runId && snapshot.state === 'completed') {
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
  expect(answer.status).toBe('applied');
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
      refreshes = 0;

      await vi.waitFor(
        async () => {
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

    it('should admit a run once the other device’s run has gone stale, with its user turn but nothing it left half done', async () => {
      const inFlight = await desktopInFlight();
      inFlight.release();
      const phone = await workspace();
      const phoneModel = recordingModel('phone answer');
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), phoneModel.transport);
      /*
       * The same in-flight run, last written longer ago than the bound: a device that went away mid-run. Only its
       * lifecycle rows, which every snapshot of a running run holds whatever else it has written by then: the person's
       * message is then in its admission alone.
       */
      const stale = new Date(Date.now() - foreignRunStaleMilliseconds - 60_000).toISOString();
      await project(
        phone,
        'device-desktop',
        rowsOf(inFlight.bytes)
          .filter((row) => row.type === 'run.lifecycle')
          .map((row) => `${JSON.stringify({ ...row, recordedAt: stale })}\n`)
          .join(''),
      );

      await turn(onPhone, 'run-phone-1', 'second, on the phone');

      /* The person's turn on the desktop rejoins; the call it left open there does not. */
      expect(transcriptOf(phoneModel.requests.at(-1))).toEqual([
        'user: in flight on the desktop',
        'user: second, on the phone',
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
            await sleep(15);
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
          runHeartbeat: heartbeatInterval,
          publish: async ({ requestId }) => {
            published.push(Date.now());
            return { requestId, status: 'applied' };
          },
        },
      );
      const startedAt = Date.now();
      await launcher.execute({
        type: 'start',
        commandId: key(),
        payload: { chatId, runId: 'run-1', trigger: 'submit', message: { id: 'user-1', role: 'user', content: 'go' } },
      });
      const rows = await rowsUntil(root, (found) =>
        found.some((row) => row.type === 'run.lifecycle' && row.state === 'completed'),
      );
      const completedAt = Date.parse(rows.findLast((row) => row.type === 'run.lifecycle')!.recordedAt);

      const whileLive = published.filter((at) => at < completedAt);
      expect(whileLive.length).toBeGreaterThanOrEqual(2);
      const gaps = [startedAt, ...whileLive].slice(1).map((at, index) => at - [startedAt, ...whileLive][index]!);
      /* Timer slack on a loaded machine, never a missed interval. */
      expect(Math.max(...gaps)).toBeLessThan(heartbeatInterval * 3);
      expect(heartbeatsAfter(rows, 'running')).toEqual([]);
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
      const rowCount = async (): Promise<number> => rowsOf(await readFile(ownLog(root), 'utf8').catch(() => '')).length;
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
            published.push({ at: Date.now(), rows: await rowCount() });
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
      const rows = await rowsUntil(root, (found) => heartbeatsAfter(found, 'running').length >= 3);
      const heartbeats = heartbeatsAfter(rows, 'running').length;
      const whileShared = published.length;
      shared.now = false;
      await sleep(300);
      const after = rowsOf(await readFile(ownLog(root), 'utf8'));
      const whileUnshared = published.length - whileShared;
      gate.resolve();

      /* While shared: one publish per heartbeat row, plus the one that asks at the run's start and the one that carries
       * the rows its first attempt wrote after that. */
      expect(whileShared).toBeLessThanOrEqual(heartbeats + 2);
      /* And never two in one tick: no probe right before a heartbeat's own publish. */
      const gaps = published
        .slice(0, whileShared)
        .slice(1)
        .map((call, index) => call.at - published[index]!.at);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(5);
      /* Once unshared, at most the one heartbeat whose publish said so, then none. */
      expect(heartbeatsAfter(after, 'running').length - heartbeats).toBeLessThanOrEqual(1);
      /* Asked at most about once an interval while unshared (300 ms at 40 ms), never twice a tick. */
      expect(whileUnshared).toBeLessThanOrEqual(9);
    });

    /* The tick that asks an unshared chat again and hears it is shared now writes its heartbeat then, not a tick later;
     * it still publishes once. */
    it('should write the heartbeat on the tick whose recheck finds the chat shared', async () => {
      const root = await workspace();
      const gate = Promise.withResolvers<void>();
      const recorded = recordingModel('answer');
      const shared = { now: false };
      const published: Array<Readonly<{ heartbeats: number; shared: boolean }>> = [];
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
            const answer = shared.now;
            const rows = rowsOf(await readFile(ownLog(root), 'utf8').catch(() => ''));
            published.push({ heartbeats: heartbeatsAfter(rows, 'running').length, shared: answer });
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
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'running'));
      await sleep(100);
      shared.now = true;
      await vi.waitFor(
        () => {
          expect(published.filter((call) => call.shared).length).toBeGreaterThanOrEqual(2);
        },
        { timeout: 3000 },
      );
      gate.resolve();

      const [recheck, next] = published.filter((call) => call.shared);
      /* The recheck's own tick wrote one row after it, and the next tick one more before its publish. */
      expect(next!.heartbeats - recheck!.heartbeats).toBe(2);
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
      const root = await pausedRun({ runHeartbeat: 10, pausedRunHold: 120, publish: sharedPublish });
      await rowsUntil(root, (found) => heartbeatsAfter(found, 'paused').length >= 2);
      await sleep(300);
      const settled = await heartbeatCount(root);
      await sleep(150);

      expect(await heartbeatCount(root)).toBe(settled);
      expect(settled).toBeLessThan(20);
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

    /* Inside its own hold the paused run still holds the chat: a segment it cannot read does not block its approval. */
    it('should apply an approval inside the paused run’s hold while another device’s segment cannot be read', async () => {
      const { root, launcher } = await pausedRunOn({ runHeartbeat: 10, pausedRunHold: 60_000 });
      await rowsUntil(root, (found) => found.some((row) => row.type === 'run.lifecycle' && row.state === 'paused'));
      await mkdir(join(root, '.tau', 'chats', chatId, 'events', 'device-phone.jsonl'), { recursive: true });

      const answer = await launcher.execute({
        type: 'resolve-interrupt',
        commandId: key(),
        payload: { chatId, runId: 'run-1', interruptId: 'int-1', outcome: 'approved' },
      });

      expect(answer).toMatchObject({ status: 'applied' });
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
  });
});
