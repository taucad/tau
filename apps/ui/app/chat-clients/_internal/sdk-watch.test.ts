import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';
import { initialChatProjection } from '#machines/chat-projection.logic.js';
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
});
