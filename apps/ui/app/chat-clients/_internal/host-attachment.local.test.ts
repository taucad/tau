/**
 * HA1: on a local placement the attachment carries only the live overlay. No host read; a superseded writer's deltas
 * are dropped per subscription; deltas for a run the ledger does not hold yet wait for the own read that admits it.
 */
import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';
import { createReplayFacts } from '@taucad/agent-host';
import type { ProjectionBatch, SourceLiveEvent } from '@taucad/agent-host';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { chatProjectionLogic, chunksOf } from '#machines/chat-projection.logic.js';
import { lifecycleRow } from '#machines/chat-projection.fixture.js';
import { hostAttachment } from '#chat-clients/_internal/host-attachment.js';

const chatId = 'chat_local';
const admitted = { ...lifecycleRow(0, 'admitted'), admission: { kind: 'tau', turnId: 'user_1' } };
const running = lifecycleRow(1, 'running');

/** The rows as the own source pages them from the file. */
const facts = (rows: readonly unknown[]): ProjectionBatch =>
  createReplayFacts(
    new TextEncoder().encode(rows.map((row) => `${JSON.stringify(row)}\n`).join('')),
    'own-file',
  ).projectionBatch({ chatId, cursor: 0, limit: 100, maxBytes: 1_000_000 });

const delta = (text: string, sourceGeneration: string, runId = 'run_1'): SourceLiveEvent => ({
  type: 'text-delta',
  chatId,
  runId,
  messageId: 'assistant_1',
  contentIndex: 0,
  delta: text,
  sourceGeneration,
});

const attach = () => {
  const projection = createActor(chatProjectionLogic).start();
  let listener: ((chatId: string, event: SourceLiveEvent) => void) | undefined;
  const read = vi.fn();
  const catchUp = vi.fn();
  const onSubscribed = vi.fn();
  const attachment = createActor(hostAttachment, {
    input: {
      chatId,
      local: async () => true,
      onSubscribed,
      connect: async () =>
        ({
          read,
          catchUp,
          subscribe: vi.fn(),
          subscribeLive: (_chatId: string, next: (chatId: string, event: SourceLiveEvent) => void) => {
            listener = next;
            return vi.fn();
          },
          close: vi.fn(async () => undefined),
        }) as unknown as AgentHostClient,
      projection,
    },
  }).start();
  const text = (): string =>
    chunksOf(projection.getSnapshot().context.live?.chunks)
      .map((chunk) => ('delta' in chunk ? chunk.delta : ''))
      .join('');
  return {
    projection,
    attachment,
    read,
    catchUp,
    onSubscribed,
    text,
    emit: (event: SourceLiveEvent) => listener?.(chatId, event),
    ready: async () =>
      vi.waitFor(() => {
        expect(listener).toBeDefined();
      }),
  };
};

describe('hostAttachment on a local placement (HA1)', () => {
  it('should read nothing from the host and report each live subscribe to the settler', async () => {
    const chat = attach();
    await chat.ready();
    await vi.waitFor(() => {
      expect(chat.onSubscribed).toHaveBeenCalledOnce();
    });
    expect(chat.read).not.toHaveBeenCalled();
    expect(chat.catchUp).not.toHaveBeenCalled();
    chat.attachment.stop();
  });

  it('should hold deltas that arrive before the own read admits their run, then show them', async () => {
    const chat = attach();
    await chat.ready();
    chat.emit(delta('Hel', 'host-a'));
    chat.emit(delta('lo', 'host-a'));
    expect(chat.text()).toBe('');

    chat.projection.send({ type: 'facts', answer: facts([admitted, running]) });
    chat.attachment.send({ type: 'own-read' });

    expect(chat.text()).toBe('Hello');
    chat.attachment.stop();
  });

  it("should drop a fenced writer's deltas once the resumed run's newer writer has been seen", async () => {
    const chat = attach();
    await chat.ready();
    chat.projection.send({ type: 'facts', answer: facts([admitted, running]) });
    chat.emit(delta('A', 'writer-old'));
    chat.emit(delta('B', 'writer-new'));
    chat.emit(delta('zombie', 'writer-old'));
    chat.emit(delta('C', 'writer-new'));

    expect(chat.text()).toBe('ABC');
    chat.attachment.stop();
  });

  it('should drop held deltas once the own read shows another run admitted instead', async () => {
    const chat = attach();
    await chat.ready();
    chat.emit(delta('stale', 'host-a', 'run_gone'));
    chat.projection.send({ type: 'facts', answer: facts([admitted, running]) });
    chat.attachment.send({ type: 'own-read' });
    chat.emit(delta('fresh', 'host-a'));

    expect(chat.text()).toBe('fresh');
    chat.attachment.stop();
  });
});
