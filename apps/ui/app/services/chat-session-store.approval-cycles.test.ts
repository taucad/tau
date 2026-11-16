// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelClosedError } from '@taucad/agent-host/channel-client';
import type { ReadAnswer } from '@taucad/agent-host/wire';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { ChatSessionStore } from '#services/chat-session-store.js';
import * as Projection from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow, writerOwnedCatchUp } from '#machines/chat-projection.fixture.js';
import { pendingAgentHostApprovals, pendingApprovals } from '#components/chat/chat-approval-banner.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- mirror the environment module's fixed exported names.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'http://test.local' } }));
vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));

/** The options Claude Code's ACP adapter offers on every permission request. */
const claudeOptions = [
  { optionId: 'allow_always', name: 'Always Allow', kind: 'allow_always' },
  { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
  { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
];
/** Long enough for every presentation retry round (250, 500 and 1000 ms) to run. */
const retryWindow = { timeout: 3000 };
const health = { historyIntact: true, newerHistory: false, quarantined: false };

type Reader = {
  cursor: number;
  readonly answer: NonNullable<Parameters<AgentHostClient['subscribe']>[3]>;
  readonly ended: (() => void) | undefined;
  alive: boolean;
};

/**
 * One owner log and the page's connections to it, as the desktop serves them: the observed attachment keeps one
 * long-poll reader per connection, and every command dials, answers and closes a connection of its own.
 */
const createHost = () => {
  const rows: Array<Record<string, unknown>> = [];
  const readers: Reader[] = [];
  let connects = 0;
  const batch = (cursor: number): Extract<ReadAnswer, { status: 'batch' }> => ({
    status: 'batch',
    sourceHealth: health,
    sourceGeneration: 'writer',
    chatId: 'chat',
    cursor,
    nextCursor: rows.length,
    endCursor: rows.length,
    events: rows.slice(cursor),
  });
  const deliver = (reader: Reader): void => {
    if (reader.alive && reader.cursor < rows.length) {
      const { cursor } = reader;
      reader.cursor = rows.length;
      reader.answer(batch(cursor));
    }
  };
  const append = (...next: Array<Record<string, unknown>>): void => {
    rows.push(...next);
    for (const reader of readers) {
      queueMicrotask(() => {
        deliver(reader);
      });
    }
  };
  const hostCommand = vi.fn<AgentHostClient['hostCommand']>(async (command) => {
    if (command.type === 'resolve-interrupt') {
      const { interruptId, optionId } = command.payload;
      queueMicrotask(() => {
        append(
          logRow(rows.length, {
            type: 'interrupt.recorded',
            interruptId,
            phase: 'resolved',
            reason: 'approved',
            payload: { outcome: 'approved', optionId },
          }),
        );
        append(lifecycleRow(rows.length, 'running'));
      });
    }
    if (command.type === 'cancel') {
      /* The host settles the open request as cancelled ahead of the run's own terminal row. */
      const open = rows.findLast((row) => row['type'] === 'interrupt.recorded' && row['phase'] === 'requested');
      queueMicrotask(() => {
        if (open !== undefined) {
          append(
            logRow(rows.length, {
              type: 'interrupt.recorded',
              interruptId: open['interruptId'],
              phase: 'resolved',
              reason: 'cancelled',
              payload: { outcome: 'cancelled' },
            }),
          );
        }
        append({ ...lifecycleRow(rows.length, 'cancelled'), detail: { code: 'USER_STOPPED', message: 'Stopped' } });
      });
    }
    return { commandId: command.commandId, generation: 0, status: 'applied', effect: 'durable', cursor: rows.length };
  });
  const connect = async () => {
    connects += 1;
    return {
      hostCommand,
      catchUp: writerOwnedCatchUp,
      read: async ({ cursor }: Readonly<{ cursor: number }>) => batch(cursor),
      subscribe: (...[{ cursor }, , ended, answer]: Parameters<AgentHostClient['subscribe']>) => {
        const reader: Reader = { cursor, answer: answer!, ended, alive: true };
        readers.push(reader);
        queueMicrotask(() => {
          if (reader.cursor >= rows.length) {
            reader.answer(batch(reader.cursor));
          } else {
            deliver(reader);
          }
        });
        return () => {
          reader.alive = false;
        };
      },
      subscribeLive: () => () => undefined,
      close: async () => undefined,
    };
  };
  /** The owner's port to this page dropped: every reader ends, as its channel's close ends it. */
  const drop = (): void => {
    for (const reader of readers.filter((candidate) => candidate.alive)) {
      reader.alive = false;
      reader.ended?.();
    }
  };
  return { rows, append, connect, drop, hostCommand, connects: () => connects };
};

const createStore = (): ChatSessionStore => {
  const store = new ChatSessionStore();
  const missing = async (): Promise<never> => {
    throw Object.assign(new Error('Missing record'), { code: 'ENOENT' });
  };
  store.setDependencies({
    getChat: async () => ({ id: 'chat', resourceId: 'project', name: '', messages: [], createdAt: 0, updatedAt: 0 }),
    patchChat: async () => undefined,
    touchChatRecency: async () => undefined,
    consumeChatStartupRequest: async () => undefined,
    commitCancelledDraftRestore: async () => undefined,
    client: {
      readFile: missing,
      readdir: async () => [],
      exists: async () => false,
      writeFile: async () => undefined,
      rmdir: async () => undefined,
      unlink: async () => undefined,
    },
  });
  return store;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChatSessionStore approval cycles with the pinned real SDK', () => {
  it('should surface every approval card while the agent host reconnects as a request arrives', async () => {
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = createHost();
    const store = createStore();
    /* While the owner's connection is being replaced, reading the run through it fails with the channel's close. */
    let reconnecting = false;
    const materialize = Projection.materializeTranscript;
    vi.spyOn(Projection, 'materializeTranscript').mockImplementation(async (...parameters) => {
      if (reconnecting) {
        throw new ChannelClosedError({ origin: 'remote', code: 'PEER_GONE' });
      }
      return materialize(...parameters);
    });
    host.rows.push(
      {
        ...lifecycleRow(0, 'admitted'),
        admission: { kind: 'tau', turnId: 'u', message: { id: 'u', role: 'user', content: 'Write the files' } },
      },
      lifecycleRow(1, 'running'),
    );
    const { chat } = store.acquire('chat', 'project');
    const unobserve = store.observe('chat', 'project');
    const unpublish = store.publishProjectHostConnector('project', host.connect);
    const cardIds = (): string[] =>
      pendingApprovals(chat.messages, Projection.selectOpenApprovals(store.getProjection('chat')!)).map(
        (approval) => approval.interruptId,
      );
    try {
      await vi.waitFor(() => {
        expect(chat.messages[0]?.id).toBe('u');
        expect(['submitted', 'streaming']).toContain(chat.status);
      });
      const cycles = 8;
      /* One request, its pause, its answer and the resumed attempt's tool result. */
      const approvalCycle = async (cycle: number): Promise<void> => {
        host.append(
          logRow(host.rows.length, {
            type: 'message.appended',
            message: { id: `say-${cycle}`, role: 'assistant', content: [{ type: 'text', text: `Step ${cycle}` }] },
          }),
          logRow(host.rows.length + 1, {
            type: 'message.appended',
            message: {
              id: `input-${cycle}`,
              role: 'tool-input',
              toolCallId: `call-${cycle}`,
              toolName: 'Write',
              content: { file: `file-${cycle}.txt` },
            },
          }),
        );
        await vi.waitFor(() => {
          expect(chat.messages.at(-1)?.parts).toContainEqual(
            expect.objectContaining({ type: 'text', text: `Step ${cycle}` }),
          );
        });
        const interruptId = `interrupt-${cycle}`;
        const request = [
          logRow(host.rows.length, {
            type: 'interrupt.recorded',
            interruptId,
            phase: 'requested',
            reason: 'approval',
            payload: {
              kind: 'approval',
              prompt: `Write file-${cycle}.txt?`,
              agentId: 'claude',
              context: {
                toolCall: { toolCallId: `toolu_${cycle}`, title: `Write file-${cycle}.txt` },
                options: claudeOptions,
              },
            },
          }),
          lifecycleRow(host.rows.length + 1, 'paused'),
        ];
        if (cycle === 7) {
          /* The seventh request lands while the concern reconnects: the open watch and the transcript read both meet
           * the dropped connection, and the attachment redials. */
          reconnecting = true;
          host.drop();
          host.append(request[0]!);
          await vi.waitFor(() => {
            expect(
              diagnostic.mock.calls.some(
                ([label]) => label === '[ChatSessionStore] projected run could not be watched',
              ),
            ).toBe(true);
          });
          host.append(request[1]!);
          await vi.waitFor(() => {
            expect(
              diagnostic.mock.calls.some(
                ([label]) => label === '[ChatSessionStore] projected transcript could not be materialized',
              ),
            ).toBe(true);
          });
          reconnecting = false;
        } else {
          host.append(...request);
        }
        await vi.waitFor(() => {
          expect(store.getProjection('chat')?.ledger.runs['run_1']?.lifecycle).toBe('paused');
          // The card the banner draws, and the transcript the person reads, both name the open request.
          expect(cardIds()).toEqual([interruptId]);
          expect(pendingAgentHostApprovals(chat.messages).map((approval) => approval.interruptId)).toEqual([
            interruptId,
          ]);
        }, retryWindow);
        expect(store.get('chat')?.messages.length).toBeGreaterThan(0);
        expect(await store.respondToProjectedApproval('chat', interruptId, { approved: true, optionId: 'allow' })).toBe(
          true,
        );
        // Not latched: every resume, the seventh's too, is watched live again.
        await vi.waitFor(() => {
          expect(store.getProjection('chat')?.ledger.runs['run_1']?.lifecycle).toBe('running');
          expect(['submitted', 'streaming']).toContain(chat.status);
        });
        host.append(
          logRow(host.rows.length, {
            type: 'message.appended',
            message: {
              id: `output-${cycle}`,
              role: 'tool-output',
              toolCallId: `call-${cycle}`,
              toolName: 'Write',
              content: 'written',
              isError: false,
            },
          }),
        );
      };
      // Each cycle answers the request the one before it left the run paused on, so they run in order.
      const cyclesFrom = async (cycle: number): Promise<void> => {
        await approvalCycle(cycle);
        if (cycle < cycles) {
          await cyclesFrom(cycle + 1);
        }
      };
      await cyclesFrom(1);
      host.append(lifecycleRow(host.rows.length, 'completed'));
      await vi.waitFor(() => {
        expect(chat.status).toBe('ready');
        expect(store.getProjection('chat')?.ledger.runs['run_1']?.lifecycle).toBe('completed');
      });
      expect(cardIds()).toEqual([]);
      const resolutions = host.hostCommand.mock.calls.filter(([command]) => command.type === 'resolve-interrupt');
      expect(resolutions).toHaveLength(cycles);
      // Every command dialled a connection of its own, beside the attachment's first one and its one redial.
      expect(host.connects()).toBeGreaterThanOrEqual(2 + host.hostCommand.mock.calls.length);
      const watched = diagnostic.mock.calls.flatMap(([label, facts]) =>
        label === '[ChatSessionStore] projected run could not be watched' && typeof facts === 'string'
          ? [JSON.parse(facts) as Record<string, unknown>]
          : [],
      );
      expect(watched[0]).toMatchObject({
        chatId: 'chat',
        runId: 'run_1',
        errorName: 'ChannelClosedError',
        errorCode: 'PEER_GONE',
        errorMessage: 'Channel closed',
        retry: 1,
      });
    } finally {
      unpublish();
      unobserve();
      store.release('chat');
    }
  });

  it('should stop a run paused on an approval, offering Stop until the host settles it as cancelled', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const host = createHost();
    const store = createStore();
    host.rows.push(
      {
        ...lifecycleRow(0, 'admitted'),
        admission: { kind: 'tau', turnId: 'u', message: { id: 'u', role: 'user', content: 'Write the file' } },
      },
      lifecycleRow(1, 'running'),
    );
    const { chat } = store.acquire('chat', 'project');
    const unobserve = store.observe('chat', 'project');
    const unpublish = store.publishProjectHostConnector('project', host.connect);
    const session = store.get('chat')!;
    /* What the composer offers Stop on (`useChatTextareaLogic`'s `canStop`) beside a streaming status. */
    const stopOffered = (): boolean =>
      session.stateActorRef.getSnapshot().context.pendingApprovalCount > 0 || store.isStopping('chat');
    try {
      await vi.waitFor(() => {
        expect(['submitted', 'streaming']).toContain(chat.status);
      });
      host.append(
        logRow(host.rows.length, {
          type: 'message.appended',
          message: { id: 'input-1', role: 'tool-input', toolCallId: 'call-1', toolName: 'Write', content: {} },
        }),
        logRow(host.rows.length + 1, {
          type: 'interrupt.recorded',
          interruptId: 'interrupt-1',
          phase: 'requested',
          reason: 'approval',
          payload: {
            kind: 'approval',
            prompt: 'Write main.geospec.ts?',
            agentId: 'claude',
            context: { toolCall: { toolCallId: 'toolu_1', title: 'Write main.geospec.ts' }, options: claudeOptions },
          },
        }),
        lifecycleRow(host.rows.length + 2, 'paused'),
      );
      await vi.waitFor(() => {
        expect(store.getProjection('chat')?.ledger.runs['run_1']?.lifecycle).toBe('paused');
        // The SDK stream closed with the pause: the status alone would offer Send.
        expect(chat.status).toBe('ready');
        expect(stopOffered()).toBe(true);
      });

      store.stopRun('chat', 'stop-button');
      expect(stopOffered()).toBe(true);
      await vi.waitFor(() => {
        expect(store.getProjection('chat')?.ledger.runs['run_1']?.lifecycle).toBe('cancelled');
        expect(store.isStopping('chat')).toBe(false);
      });
      expect(stopOffered()).toBe(false);
      expect(Projection.selectOpenApprovals(store.getProjection('chat')!)).toEqual([]);
      expect(pendingAgentHostApprovals(chat.messages)).toEqual([]);
      expect(chat.status).toBe('ready');
      const cancels = host.hostCommand.mock.calls.filter(([command]) => command.type === 'cancel');
      expect(cancels.map(([command]) => command.payload)).toEqual([{ chatId: 'chat', runId: 'run_1' }]);
      // The cancel's facts are logged as JSON text, which the desktop log keeps whole.
      const logged = info.mock.calls.find(([label]) => label === '[ChatSessionStore] host cancel');
      expect(typeof logged?.[1]).toBe('string');
      expect(JSON.parse(logged![1] as string)).toEqual({
        chatId: 'chat',
        runId: 'run_1',
        commandId: cancels[0]![0].commandId,
        origin: 'stop-button',
      });
    } finally {
      unpublish();
      unobserve();
      store.release('chat');
    }
  });
});
