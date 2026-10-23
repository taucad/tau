/**
 * A chat two devices have written (XD1): this device appends to its own `events.jsonl`, and sync projects every other
 * device's log beside it as `events/<deviceId>.jsonl`. The model's next turn has to see both devices' turns, in merged
 * order, on every host; the writer still appends only to its own file, and run bookkeeping reads only its own rows.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { createBrowserChatStore } from '#browser.js';
import { memoryFileSystem } from '#browser/leadership.fixture.js';
import type { MemoryFileSystem } from '#browser/leadership.fixture.js';
import { fakePlacement } from '#host/tau-agent-host.fixture.js';
import { createAgentLauncher } from '#launchers/agent-launcher.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import type { ChatStore } from '#launchers/chat-store.js';
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

const launchers: AgentLauncher[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(launchers.splice(0).map(async (launcher) => launcher.close()));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const launch = (
  chats: ChatStore,
  transport: ModelTransport,
  options: Readonly<{ runHeartbeat?: number; publish?: NonNullable<TurnPlacementPort['publish']> }> = {},
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
    ...(options.runHeartbeat === undefined ? {} : { delays: { runHeartbeat: options.runHeartbeat } }),
  });
  launchers.push(launcher);
  return launcher;
};

let keys = 0;
const key = (): string => {
  keys += 1;
  return `cmd-${String(keys)}`;
};

/** Start one user turn and wait until its run completes. */
const turn = async (launcher: AgentLauncher, runId: string, text: string): Promise<HostRunSnapshot | undefined> => {
  const answer = await launcher.execute({
    type: 'start',
    commandId: key(),
    payload: { chatId, runId, trigger: 'submit', message: { id: `user-${runId}`, role: 'user', content: text } },
  });
  expect(answer.status).toBe('applied');
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

const rowsOf = (bytes: Uint8Array<ArrayBuffer> | string): AgentLogEvent[] =>
  (typeof bytes === 'string' ? bytes : decoder.decode(bytes))
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as AgentLogEvent);

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

    it('should admit a run once the other device’s run has gone stale, with its user turn but nothing it left half done', async () => {
      const inFlight = await desktopInFlight();
      inFlight.release();
      const phone = await workspace();
      const phoneModel = recordingModel('phone answer');
      const onPhone = launch(createNodeChatStore({ workspaceRoot: phone }), phoneModel.transport);
      /* The same in-flight rows, last written longer ago than the bound: a device that went away mid-run. */
      const stale = new Date(Date.now() - foreignRunStaleMilliseconds - 60_000).toISOString();
      await project(
        phone,
        'device-desktop',
        rowsOf(inFlight.bytes)
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
        { runHeartbeat: 20 },
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
  });
});
