/**
 * Test fixture: two tabs of one origin as two launchers in one Node process, over Node's Web Locks and
 * `BroadcastChannel` and one in-memory provider filesystem (W6 RH-S7).
 */

import { setTimeout as sleep } from 'node:timers/promises';

import { vi } from 'vitest';

import { createBrowserChatStore } from '#browser.js';
import type { BrowserChatStoreOptions, ProviderEventLogOptions } from '#browser.js';
import { createAgentLauncher } from '#launchers/agent-launcher.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import type { AgentLogEvent } from '#log/event-types.js';
import { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';
import type { ToolRegistry } from '#waist/ports.js';
import type { CommandAnswer } from '#wire/commands.schema.js';

export const model = {
  id: 'fixture-model',
  providerKind: 'vertexai',
  contextWindow: 200_000,
  maxTokens: 4096,
} as const;
const emptyTools: ToolRegistry = { list: () => [], invoke: async () => ({ content: 'no tools', isError: true }) };
export const projectId = 'project-1';
export const delays = { heartbeatInterval: 100, heartbeatTimeout: 400, recoveryDelay: 400 } as const;
const encoder = new TextEncoder();

export type MemoryFileSystem = ProviderEventLogOptions['fileSystem'] &
  Readonly<{ files: Map<string, Uint8Array<ArrayBuffer>> }>;

export const memoryFileSystem = (): MemoryFileSystem => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const bytesOf = (data: Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> =>
    typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
  return {
    files,
    exists: async (path) => files.has(path),
    readFile: async (path) => {
      const bytes = files.get(path);
      if (bytes === undefined) {
        throw Object.assign(new Error(`${path} does not exist.`), { code: 'ENOENT' });
      }
      return new Uint8Array(bytes);
    },
    writeFile: async (path, data) => {
      files.set(path, bytesOf(data));
    },
    appendFile: async (path, data) => {
      const previous = files.get(path) ?? new Uint8Array();
      const added = bytesOf(data);
      const next = new Uint8Array(previous.byteLength + added.byteLength);
      next.set(previous);
      next.set(added, previous.byteLength);
      files.set(path, next);
    },
    unlink: async (path) => {
      files.delete(path);
    },
  };
};

/** A gateway that never answers, so a run stays live for the whole case. */
export const stalledGateway = (): typeof globalThis.fetch =>
  vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }),
  ) as unknown as typeof globalThis.fetch;

const launchers: AgentLauncher[] = [];

/** Close every launcher `launch` made; call it in `afterEach`. */
export const closeLaunchers = async (): Promise<void> => {
  await Promise.all(launchers.splice(0).map(async (launcher) => launcher.close()));
};

export const launch = (
  fileSystem: MemoryFileSystem,
  tabId: string,
  options: Readonly<{ build?: string; clock?: BrowserChatStoreOptions['clock']; fetch?: typeof globalThis.fetch }> = {},
): AgentLauncher => {
  const fetch = options.fetch ?? stalledGateway();
  const launcher = createAgentLauncher({
    chats: createBrowserChatStore({
      projectId,
      tabId,
      build: options.build ?? 'build-1',
      log: { kind: 'provider', fileSystem },
      delays,
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    }),
    modelTransport: createTauCloudGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      model,
      auth: () => 'bearer',
      fetch,
    }),
    credential: () => ({ mode: 'session' }),
    model,
    systemPrompt: 'You are Tau.',
    toolRegistry: emptyTools,
  });
  launchers.push(launcher);
  return launcher;
};

let keys = 0;
const key = (): string => {
  keys += 1;
  return `cmd-${String(keys)}`;
};

export const start = async (launcher: AgentLauncher, chatId: string, runId: string): Promise<CommandAnswer> =>
  launcher.execute({
    type: 'start',
    commandId: key(),
    payload: { chatId, runId, trigger: 'submit', message: { id: `user-${runId}`, role: 'user', content: 'hello' } },
  });

export const cancel = async (launcher: AgentLauncher, chatId: string, runId: string): Promise<CommandAnswer> =>
  launcher.execute({ type: 'cancel', commandId: key(), payload: { chatId, runId } });

export const logPath = (chatId: string): string => `.tau/chats/${chatId}/events.jsonl`;

export const rowsOf = (fileSystem: MemoryFileSystem, chatId: string): AgentLogEvent[] =>
  new TextDecoder()
    .decode(fileSystem.files.get(logPath(chatId)) ?? new Uint8Array())
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as AgentLogEvent);

export const heldLocks = async (): Promise<readonly string[]> => {
  const { held = [] } = await navigator.locks.query();
  return held.map((lock) => lock.name ?? '');
};

export const until = async (check: () => boolean | Promise<boolean>, attempts = 300): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- polling is sequential by nature.
    if (await check()) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await sleep(10);
  }
  throw new Error('The condition never held.');
};

/** A chat whose run a previous tab left `running` at epoch 1. */
export const seedRunningChat = (fileSystem: MemoryFileSystem, chatId: string): void => {
  const base = {
    version: 1,
    leaderEpoch: '1:previous',
    recordedAt: new Date().toISOString(),
    runId: 'run-1',
    epoch: 1,
  };
  const rows = [
    { ...base, sequence: 0, type: 'run.lifecycle', state: 'admitted' },
    {
      ...base,
      sequence: 1,
      type: 'turn.history-projection-committed',
      retainedMessageIds: [],
      message: { id: 'user-1', role: 'user', content: 'hello' },
      context: {
        version: 1,
        systemPrompt: 'You are Tau.',
        model,
        toolChoice: 'auto',
        initialMessages: [],
        postCompactionMessages: [],
      },
    },
    { ...base, sequence: 2, type: 'run.lifecycle', state: 'running' },
  ];
  fileSystem.files.set(logPath(chatId), encoder.encode(rows.map((row) => JSON.stringify(row)).join('\n') + '\n'));
};
