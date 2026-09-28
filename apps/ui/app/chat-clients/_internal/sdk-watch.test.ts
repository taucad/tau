import { Chat } from '@ai-sdk/react';
import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import { initialChatProjection, reduceChatProjection } from '#machines/chat-projection.logic.js';
import type { ChatProjection } from '#machines/chat-projection.logic.js';
import { lifecycleRow } from '#machines/chat-projection.fixture.js';
import { BrowserPlacementChatTransport } from '#chat-clients/_internal/browser-agent-host-transport.js';
import { sdkWatch } from '#chat-clients/_internal/sdk-watch.js';

describe('sdkWatch', () => {
  it('arms the projection stream before asking the SDK to send and only detaches on stop', () => {
    const order: string[] = [];
    const disarm = vi.fn();
    const unsubscribe = vi.fn();
    const actor = createActor(sdkWatch, {
      input: {
        runId: 'run_1',
        getProjection: () => initialChatProjection,
        subscribe: () => unsubscribe,
        transport: { arm: () => order.push('arm'), disarm },
        chat: {
          sendMessage: () => {
            order.push('send');
          },
          regenerate: vi.fn(),
          resumeStream: vi.fn(),
        },
        via: 'send',
        message: { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'go' }] },
      },
    });

    actor.start();
    expect(order).toEqual(['arm', 'send']);
    actor.stop();
    expect(disarm).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('should render a resumed live projection through the real SDK chat', async () => {
    let projection: ChatProjection = reduceChatProjection(initialChatProjection, {
      type: 'batch',
      answer: {
        status: 'batch',
        cursor: 0,
        nextCursor: 2,
        endCursor: 2,
        events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
      },
    }).state;
    const listeners = new Set<() => void>();
    const transport = new BrowserPlacementChatTransport<MyUIMessage>();
    const chat = new Chat<MyUIMessage>({ id: 'chat_1', transport });
    const actor = createActor(sdkWatch, {
      input: {
        runId: 'run_1',
        getProjection: () => projection,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        transport,
        chat,
        via: 'resume',
      },
    });

    try {
      actor.start();
      projection = reduceChatProjection(projection, {
        type: 'live',
        event: {
          type: 'text-delta',
          chatId: 'chat_1',
          runId: 'run_1',
          messageId: 'assistant-1',
          contentIndex: 0,
          delta: 'Partial reply',
        },
      }).state;
      for (const listener of listeners) {
        listener();
      }
      await vi.waitFor(() => {
        expect(chat.messages.at(-1)?.parts).toContainEqual(
          expect.objectContaining({ type: 'text', text: 'Partial reply' }),
        );
      });
    } finally {
      actor.stop();
      await chat.stop();
    }
  });
});
