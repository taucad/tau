// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { mock } from 'vitest-mock-extended';
import type { UIMessageChunk, ChatStatus } from 'ai';
import type { Chat } from '@ai-sdk/react';
import type { MyUIMessage } from '@taucad/chat';
import type * as SharedChat from '#chat-clients/_internal/shared-chat-transport.js';
import { BrowserPlacementChatTransport } from '#chat-clients/_internal/browser-agent-host-transport.js';
import { serializeTranscript } from '#utils/chat.utils.js';
import * as Projection from '#machines/chat-projection.logic.js';
import * as HostCommands from '#chat-clients/_internal/host-command.js';
import {
  lifecycleRow,
  logRow,
  publishLogRows,
  publishLogPage,
  writerOwnedCatchUp,
} from '#machines/chat-projection.fixture.js';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import {
  chatTurnAdmission,
  publishChatTurnAdmission,
  resetChatTurnServices,
} from '#chat-clients/_internal/chat-host-binding.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import type { HostCommand } from '@taucad/agent-host/wire';
import { ChatSessionStore } from '#services/chat-session-store.js';
import type { ChatSessionDeps } from '#services/chat-session-store.js';

const harness = vi.hoisted(() => ({ errorStatuses: [] as ChatStatus[] }));
// eslint-disable-next-line @typescript-eslint/naming-convention -- mirror the environment module's fixed exported names.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'http://test.local' } }));
vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));
vi.mock('#chat-clients/_internal/shared-chat-transport.js', async (importOriginal) => {
  const original = await importOriginal<typeof SharedChat>();
  return {
    createChatInstance: (options: Parameters<typeof original.createChatInstance>[0]) => {
      const chat = original.createChatInstance({
        ...options,
        onError: (error) => {
          harness.errorStatuses.push(chat.status);
          options.onError(error);
        },
      });
      return chat;
    },
  };
});

/** The real SDK rejects this causally invalid presentation, while its request promise resolves. */
const poisonedStream = (): ReadableStream<UIMessageChunk> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'start', messageId: 'poisoned' });
      controller.enqueue({ type: 'tool-output-available', toolCallId: 'missing-input', output: 'private payload' });
      controller.close();
    },
  });

/** Hydrate a real store without filesystem or execution effects. */
const acquire = (): Readonly<{ store: ChatSessionStore; chat: Chat<MyUIMessage>; deps: ChatSessionDeps }> => {
  const deps = mock<ChatSessionDeps>({
    getChat: vi.fn(async () => ({
      id: 'chat_1',
      resourceId: 'project_1',
      name: '',
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    })),
    client: mock<ChatSessionDeps['client']>({
      readFile: vi.fn(async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }),
      readdir: vi.fn(async () => []),
      exists: vi.fn(async () => false),
      writeFile: vi.fn(async () => undefined),
    }),
  });
  const store = new ChatSessionStore({
    chatSession: chatSessionMachine.provide({ actors: { admitTurn: chatTurnAdmission } }),
  });
  store.setDependencies(deps);
  return { store, chat: store.acquire('chat_1', 'project_1').chat, deps };
};

/** An admission with its visible input: an SDK watch opens only once the run's user turn is projected. */
const admittedRow = (sequence: number, runId = 'run_1'): Record<string, unknown> => {
  const message = { id: `user_${runId}`, role: 'user', content: 'Continue this turn' };
  return { ...lifecycleRow(sequence, 'admitted', runId), admission: { kind: 'tau', turnId: message.id, message } };
};

/** A running run with its visible input, as its first two rows. */
const runningRows = (runId = 'run_1'): Array<Record<string, unknown>> => [
  admittedRow(0, runId),
  lifecycleRow(1, 'running', runId),
];

/** One authoritative assistant row arriving after the presentation failed. */
const replyRow = (sequence: number, text: string): Record<string, unknown> =>
  logRow(sequence, {
    type: 'message.appended',
    message: { id: `assistant-${sequence}`, role: 'assistant', content: [{ type: 'text', text }] },
  });

const stores: ChatSessionStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) {
    const cursor = store.getProjection('chat_1')?.ledger.position.cursor ?? 0;
    publishLogRows(store, 'chat_1', [lifecycleRow(cursor, 'completed')], cursor);
    store.release('chat_1');
  }
  vi.restoreAllMocks();
  harness.errorStatuses.length = 0;
  resetChatTurnServices();
});

describe('ChatSessionStore real SDK presentation recovery', () => {
  it('should recover an active failed request through a read-only watch and converge at terminal', async () => {
    const hostCommand = vi.spyOn(HostCommands, 'sendHostCommand');
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reconnect = vi
      .spyOn(BrowserPlacementChatTransport.prototype, 'reconnectToStream')
      .mockImplementationOnce(async () => poisonedStream());
    const { store, chat, deps } = acquire();
    stores.push(store);
    const resolved: ChatStatus[] = [];
    const resume = chat.resumeStream;
    vi.spyOn(chat, 'resumeStream').mockImplementation(async () => {
      await resume();
      resolved.push(chat.status);
    });
    publishLogRows(store, 'chat_1', runningRows());
    await vi.waitFor(() => {
      expect(reconnect).toHaveBeenCalledTimes(2);
    });
    expect(harness.errorStatuses).toEqual(['streaming']);
    expect(resolved).toContain('ready');
    publishLogRows(store, 'chat_1', [replyRow(2, 'Recovered edit')], 2);
    await vi.waitFor(() => {
      expect(chat.messages.at(-1)?.parts).toContainEqual({ type: 'text', text: 'Recovered edit', state: 'done' });
    });
    publishLogRows(
      store,
      'chat_1',
      [
        logRow(3, {
          type: 'message.appended',
          message: {
            id: 'edit-input',
            role: 'tool-input',
            toolCallId: 'edit-1',
            toolName: 'edit_file',
            content: { targetFile: 'main.cs', codeEdit: 'after' },
          },
        }),
        logRow(4, {
          type: 'message.appended',
          message: {
            id: 'edit-output',
            role: 'tool-output',
            toolCallId: 'edit-1',
            toolName: 'edit_file',
            content: {
              diffStats: { linesAdded: 1, linesRemoved: 1, originalContent: 'before', modifiedContent: 'after' },
            },
            isError: false,
          },
        }),
        lifecycleRow(5, 'completed'),
      ],
      3,
    );
    await vi.waitFor(() => {
      expect(chat.status).toBe('ready');
    });
    expect(chat.error).toBeUndefined();
    const exported = serializeTranscript(chat.messages, 'Recovered fixture');
    expect(exported).toContain('targetFile: main.cs');
    expect(exported).toContain('+1/-1 lines');
    expect(exported).toContain('after');
    expect(deps.patchChat).not.toHaveBeenCalled();
    expect(hostCommand).not.toHaveBeenCalled();
    expect(diagnostic).toHaveBeenCalledWith('[ChatSessionStore] presentation recovery', {
      chatId: 'chat_1',
      runId: 'run_1',
      status: 'error',
      errorName: 'AI_UIMessageStreamError',
      chunkId: 'missing-input',
      chunkType: 'tool-invocation',
      cursor: 2,
      mode: 'retry-watch',
      phase: 'running',
    });
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private payload');
  });

  it('should bound repeated failures while continuing to materialize active durable history', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reconnect = vi
      .spyOn(BrowserPlacementChatTransport.prototype, 'reconnectToStream')
      .mockImplementationOnce(async () => poisonedStream())
      .mockImplementationOnce(async () => poisonedStream());
    const { store, chat } = acquire();
    stores.push(store);
    publishLogRows(store, 'chat_1', runningRows());
    await vi.waitFor(() => {
      expect(harness.errorStatuses).toHaveLength(2);
      expect(chat.status).toBe('ready');
    });
    publishLogRows(store, 'chat_1', [replyRow(2, 'Durable after retry limit')], 2);
    await vi.waitFor(() => {
      expect(chat.messages.at(-1)?.parts).toContainEqual({
        type: 'text',
        text: 'Durable after retry limit',
        state: 'done',
      });
    });
    expect(reconnect).toHaveBeenCalledTimes(2);
    publishLogRows(store, 'chat_1', [lifecycleRow(3, 'completed')], 3);
    await vi.waitFor(() => {
      expect(chat.status).toBe('ready');
    });
    expect(reconnect).toHaveBeenCalledTimes(2);
  });

  it('should recover terminal history when settlement retires the failed watch before its queued reset', async () => {
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hostCommand = vi.spyOn(HostCommands, 'sendHostCommand');
    const reconnect = vi
      .spyOn(BrowserPlacementChatTransport.prototype, 'reconnectToStream')
      .mockImplementationOnce(async () => poisonedStream());
    const { store, chat } = acquire();
    stores.push(store);
    const unregister = chat['~registerStatusCallback'](() => {
      if (chat.status === 'error') {
        publishLogRows(store, 'chat_1', [replyRow(2, 'Terminal recovery'), lifecycleRow(3, 'completed')], 2);
      }
    });
    publishLogRows(store, 'chat_1', runningRows());
    await vi.waitFor(() => {
      expect(chat.status).toBe('ready');
      expect(chat.messages.at(-1)?.parts).toContainEqual({ type: 'text', text: 'Terminal recovery', state: 'done' });
    });
    unregister();
    expect(reconnect).toHaveBeenCalledOnce();
    expect(hostCommand).not.toHaveBeenCalled();
    expect(diagnostic).toHaveBeenCalledWith(
      '[ChatSessionStore] presentation recovery',
      expect.objectContaining({ phase: 'completed', mode: 'durable-only', cursor: 4 }),
    );
  });

  it('should wait for a caught-up durable page after retiring an invalid watch', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reconnect = vi
      .spyOn(BrowserPlacementChatTransport.prototype, 'reconnectToStream')
      .mockImplementationOnce(async () => poisonedStream());
    const { store, chat } = acquire();
    stores.push(store);
    const unregister = chat['~registerStatusCallback'](() => {
      if (chat.status === 'error') {
        publishLogPage(store, 'chat_1', [], { cursor: 2, endCursor: 4 });
      }
    });
    publishLogRows(store, 'chat_1', runningRows());
    await vi.waitFor(() => {
      expect(harness.errorStatuses).toHaveLength(1);
      expect(chat.status).toBe('ready');
    });
    expect(reconnect).toHaveBeenCalledOnce();
    publishLogRows(store, 'chat_1', [replyRow(2, 'Caught up later'), lifecycleRow(3, 'completed')], 2);
    await vi.waitFor(() => {
      expect(chat.messages.at(-1)?.parts).toContainEqual({ type: 'text', text: 'Caught up later', state: 'done' });
    });
    unregister();
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it('should fence queued recovery after disposal and reacquisition of the same chat', async () => {
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(BrowserPlacementChatTransport.prototype, 'reconnectToStream').mockImplementationOnce(async () =>
      poisonedStream(),
    );
    const { store, chat } = acquire();
    stores.push(store);
    let replacement: Chat<MyUIMessage> | undefined;
    const unregister = chat['~registerStatusCallback'](() => {
      if (chat.status === 'error') {
        publishLogRows(store, 'chat_1', [lifecycleRow(2, 'completed')], 2);
        store.release('chat_1');
        queueMicrotask(() => {
          replacement = store.acquire('chat_1', 'project_1').chat;
        });
      }
    });
    publishLogRows(store, 'chat_1', runningRows());
    await vi.waitFor(() => {
      expect(replacement).toBeDefined();
      expect(replacement).not.toBe(chat);
      expect(replacement?.status).toBe('ready');
    });
    unregister();
    expect(replacement?.error).toBeUndefined();
    expect(diagnostic).not.toHaveBeenCalledWith('[ChatSessionStore] presentation recovery', expect.anything());
  });

  it('should retire a failed old run and recover the newer active run before its queued reset', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hostCommand = vi.spyOn(HostCommands, 'sendHostCommand');
    const reconnect = vi
      .spyOn(BrowserPlacementChatTransport.prototype, 'reconnectToStream')
      .mockImplementationOnce(async () => poisonedStream());
    const { store, chat } = acquire();
    stores.push(store);
    const unregister = chat['~registerStatusCallback'](() => {
      if (chat.status === 'error') {
        publishLogRows(
          store,
          'chat_1',
          [lifecycleRow(2, 'completed'), admittedRow(3, 'run_new'), lifecycleRow(4, 'running', 'run_new')],
          2,
        );
      }
    });
    publishLogRows(store, 'chat_1', runningRows());
    await vi.waitFor(() => {
      expect(reconnect).toHaveBeenCalledTimes(2);
    });
    publishLogRows(
      store,
      'chat_1',
      [
        logRow(5, {
          runId: 'run_new',
          type: 'message.appended',
          message: {
            id: 'new-reply',
            role: 'assistant',
            content: [{ type: 'text', text: 'New run reply' }],
          },
        }),
        lifecycleRow(6, 'completed', 'run_new'),
      ],
      5,
    );
    await vi.waitFor(() => {
      expect(chat.status).toBe('ready');
      expect(chat.messages.at(-1)?.parts).toContainEqual({ type: 'text', text: 'New run reply', state: 'done' });
    });
    unregister();
    expect(chat.error).toBeUndefined();
    expect(hostCommand).not.toHaveBeenCalled();
  });

  it('should bound reconstruction failures for an unchanged durable prefix and retry changed history', async () => {
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reconnect = vi
      .spyOn(BrowserPlacementChatTransport.prototype, 'reconnectToStream')
      .mockImplementationOnce(async () => poisonedStream());
    const materialize = Projection.materializeTranscript;
    let rejectRecovery = true;
    const materialization = vi.spyOn(Projection, 'materializeTranscript').mockImplementation(async (...parameters) => {
      if (rejectRecovery && harness.errorStatuses.length > 0) {
        throw new Error('private reconstruction payload');
      }
      return materialize(...parameters);
    });
    const { store, chat } = acquire();
    stores.push(store);
    publishLogRows(store, 'chat_1', runningRows());
    await vi.waitFor(() => {
      expect(diagnostic).toHaveBeenCalledWith(
        '[ChatSessionStore] projected run could not be watched',
        expect.objectContaining({ chatId: 'chat_1', runId: 'run_1', cursor: 2, errorName: 'Error' }),
      );
    });
    const calls = materialization.mock.calls.length;
    publishLogRows(store, 'chat_1', [], 2);
    await Promise.resolve();
    expect(materialization).toHaveBeenCalledTimes(calls);
    rejectRecovery = false;
    publishLogRows(store, 'chat_1', [replyRow(2, 'Reconstruction restored')], 2);
    await vi.waitFor(() => {
      expect(chat.messages.at(-1)?.parts).toContainEqual({
        type: 'text',
        text: 'Reconstruction restored',
        state: 'done',
      });
    });
    expect(reconnect).toHaveBeenCalledOnce();
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private reconstruction payload');
  });

  it('should reject a malformed durable transcript without accepting its partial SDK prefix or retrying forever', async () => {
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hostCommand = vi.spyOn(HostCommands, 'sendHostCommand');
    const { store, chat } = acquire();
    stores.push(store);
    publishLogRows(store, 'chat_1', [
      ...runningRows(),
      replyRow(2, 'Partial poisoned prefix'),
      logRow(3, {
        type: 'message.appended',
        message: {
          id: 'orphan',
          role: 'tool-output',
          toolCallId: 'missing-input',
          toolName: 'read',
          content: 'private result',
          isError: false,
        },
      }),
      lifecycleRow(4, 'completed'),
    ]);
    await vi.waitFor(() => {
      expect(diagnostic).toHaveBeenCalledWith(
        '[ChatSessionStore] projected transcript could not be materialized',
        expect.objectContaining({
          chatId: 'chat_1',
          runId: 'run_1',
          cursor: 5,
          errorName: 'AI_UIMessageStreamError',
          chunkId: 'missing-input',
        }),
      );
    });
    expect(chat.messages).toEqual([]);
    const warnings = diagnostic.mock.calls.length;
    publishLogRows(store, 'chat_1', [], 5);
    await Promise.resolve();
    expect(diagnostic).toHaveBeenCalledTimes(warnings);
    store.receiveHostReadAnswer('chat_1', { status: 'refused', reason: 'identity-mismatch' });
    publishLogRows(store, 'chat_1', [
      ...runningRows(),
      replyRow(2, 'Repaired durable history'),
      lifecycleRow(3, 'completed'),
    ]);
    await vi.waitFor(() => {
      expect(chat.messages.at(-1)?.parts).toContainEqual({
        type: 'text',
        text: 'Repaired durable history',
        state: 'done',
      });
    });
    expect(hostCommand).not.toHaveBeenCalled();
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private result');
  });

  it('should fence a superseded materialization rejection before changing the newer same-run watch', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const materialize = Projection.materializeTranscript;
    const pending = Promise.withResolvers<MyUIMessage[]>();
    let held = false;
    vi.spyOn(Projection, 'materializeTranscript').mockImplementation(async (...parameters) => {
      if (!held && parameters[1] === 'run_1') {
        held = true;
        return pending.promise;
      }
      return materialize(...parameters);
    });
    const reconnect = vi.spyOn(BrowserPlacementChatTransport.prototype, 'reconnectToStream');
    const { store, chat } = acquire();
    stores.push(store);
    publishLogRows(store, 'chat_1', runningRows());
    await vi.waitFor(() => {
      expect(held).toBe(true);
    });
    publishLogRows(store, 'chat_1', [lifecycleRow(2, 'completed')], 2);
    publishLogRows(store, 'chat_1', [logRow(3, { type: 'run.lifecycle', state: 'running', attempt: 2 })], 3);
    await vi.waitFor(() => {
      expect(reconnect).toHaveBeenCalledOnce();
    });
    pending.reject(new Error('Retired reconstruction'));
    await Promise.resolve();
    publishLogRows(store, 'chat_1', [replyRow(4, 'New attempt reply'), lifecycleRow(5, 'completed')], 4);
    await vi.waitFor(() => {
      expect(chat.status).toBe('ready');
    });
    store.release('chat_1');
    await vi.waitFor(() => {
      expect(store.get('chat_1')).toBeUndefined();
    });
    stores.splice(stores.indexOf(store), 1);
  });

  it.each(['source-replacement', 'rewind-retirement'] as const)(
    'should fence held Resume materialization after %s',
    async (invalidation) => {
      const { store } = acquire();
      stores.push(store);
      publishLogRows(store, 'chat_1', [
        ...runningRows(),
        replyRow(2, 'Retired paragraph'),
        lifecycleRow(3, 'cancelled'),
      ]);
      const text = (): string =>
        store
          .get('chat_1')!
          .messages.flatMap((message) => message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])))
          .join('|');
      await vi.waitFor(() => {
        expect(text()).toContain('Retired paragraph');
      });
      const materialize = Projection.materializeTranscript;
      const pending = Promise.withResolvers<MyUIMessage[]>();
      let held = false;
      vi.spyOn(Projection, 'materializeTranscript').mockImplementation(async (...parameters) => {
        if (!held && parameters[1] === 'run_1') {
          held = true;
          return pending.promise;
        }
        return materialize(...parameters);
      });
      publishLogRows(store, 'chat_1', [logRow(4, { type: 'run.lifecycle', state: 'running', attempt: 2 })], 4);
      await vi.waitFor(() => {
        expect(held).toBe(true);
      });
      expect(text()).toContain('Retired paragraph');
      if (invalidation === 'source-replacement') {
        store.receiveHostReadAnswer('chat_1', {
          status: 'refused',
          reason: 'identity-mismatch',
        });
        publishLogRows(store, 'chat_1', [
          ...runningRows('replacement'),
          logRow(2, {
            runId: 'replacement',
            type: 'message.appended',
            message: {
              id: 'replacement-answer',
              role: 'assistant',
              content: [{ type: 'text', text: 'Authoritative replacement' }],
            },
          }),
          lifecycleRow(3, 'completed', 'replacement'),
        ]);
      } else {
        publishLogRows(
          store,
          'chat_1',
          [
            {
              ...admittedRow(5, 'replacement'),
              admission: {
                kind: 'tau',
                turnId: 'user_replacement',
                message: { id: 'user_replacement', role: 'user', content: 'Replacement prompt' },
                rewind: { trigger: 'edit', retainedMessageIds: [] },
              },
            },
            logRow(6, { runId: 'replacement', type: 'history.rewound', trigger: 'edit', retainedMessageIds: [] }),
            lifecycleRow(7, 'running', 'replacement'),
            logRow(8, {
              runId: 'replacement',
              type: 'message.appended',
              message: {
                id: 'replacement-answer',
                role: 'assistant',
                content: [{ type: 'text', text: 'Authoritative replacement' }],
              },
            }),
            lifecycleRow(9, 'completed', 'replacement'),
          ],
          5,
        );
      }
      await vi.waitFor(() => {
        expect(text()).toContain('Authoritative replacement');
      });
      expect(text()).not.toContain('Retired paragraph');
      pending.resolve([]);
      await vi.waitFor(() => {
        expect(store.get('chat_1')!.chat.status).toBe('ready');
      });
      expect(text()).toContain('Authoritative replacement');
      expect(text()).not.toContain('Retired paragraph');
    },
  );

  it('should reset the bounded watch budget for a deliberately admitted Resume of the same run', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reconnect = vi
      .spyOn(BrowserPlacementChatTransport.prototype, 'reconnectToStream')
      .mockImplementationOnce(async () => poisonedStream())
      .mockImplementationOnce(async () => poisonedStream());
    const { store, chat } = acquire();
    stores.push(store);
    publishLogRows(store, 'chat_1', runningRows());
    await vi.waitFor(() => {
      expect(harness.errorStatuses).toHaveLength(2);
      expect(chat.status).toBe('ready');
    });
    publishLogRows(store, 'chat_1', [lifecycleRow(2, 'failed')], 2);
    const owner = createActor(projectSessionMachine, { input: { projectId: 'project_1' } });
    owner.start();
    store.setFocusedProject('project_1');
    store.setProjectSession('project_1', owner);
    const command: HostCommand = {
      type: 'resume',
      commandId: 'resume-explicit',
      payload: { chatId: 'chat_1', runId: 'run_1' },
    };
    const hostCommand = vi.fn<AgentHostClient['hostCommand']>(async () => ({
      commandId: command.commandId,
      generation: 1,
      status: 'applied',
      effect: 'durable',
      cursor: 3,
    }));
    const unpublish = store.publishProjectHostConnector('project_1', async () =>
      mock<AgentHostClient>({ catchUp: writerOwnedCatchUp, hostCommand, close: vi.fn(async () => undefined) }),
    );
    const unadmit = publishChatTurnAdmission('chat_1', async () => ({
      runId: 'run_1',
      leaseTurnId: undefined,
      request: { kind: 'continue', command },
    }));
    try {
      await store.requestTurn('chat_1', { kind: 'continue' });
      await vi.waitFor(() => {
        expect(hostCommand).toHaveBeenCalledExactlyOnceWith(command);
      });
      publishLogRows(store, 'chat_1', [logRow(3, { type: 'run.lifecycle', state: 'running', attempt: 2 })], 3);
      await vi.waitFor(() => {
        expect(reconnect).toHaveBeenCalledTimes(3);
      });
      publishLogRows(store, 'chat_1', [replyRow(4, 'Explicit resume reply'), lifecycleRow(5, 'completed')], 4);
      await vi.waitFor(() => {
        expect(chat.status).toBe('ready');
      });
      expect(hostCommand).toHaveBeenCalledOnce();
    } finally {
      unadmit();
      unpublish();
      owner.stop();
    }
  });
});
