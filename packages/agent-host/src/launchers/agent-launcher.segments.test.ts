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
import { createNodeChatStore } from '#node.js';
import type {
  HostRunSnapshot,
  ModelStreamEvent,
  ModelStreamRequest,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';

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

const launch = (chats: ChatStore, transport: ModelTransport): AgentLauncher => {
  const launcher = createAgentLauncher({
    chats,
    modelTransport: transport,
    credential: () => ({ mode: 'session' }),
    model,
    systemPrompt: 'You are Tau.',
    toolRegistry: emptyTools,
    turnPlacement: fakePlacement({ registry: emptyTools }).port,
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
