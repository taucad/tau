import { describe, expect, it } from 'vitest';
import type { UIMessageChunk } from 'ai';
import type { MyUIMessage } from '@taucad/chat';
import { BrowserPlacementChatTransport } from '#chat-clients/_internal/browser-agent-host-transport.js';

type SendOptions = Parameters<BrowserPlacementChatTransport<MyUIMessage>['sendMessages']>[0];

const sendOptions: SendOptions = {
  chatId: 'chat_watch',
  trigger: 'submit-message',
  messageId: undefined,
  messages: [],
  abortSignal: undefined,
  body: {},
};

const watch = (): ReadableStream<UIMessageChunk> =>
  new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.close();
    },
  });

describe('BrowserPlacementChatTransport', () => {
  it('should hand the armed projection watch to one SDK send', async () => {
    const transport = new BrowserPlacementChatTransport<MyUIMessage>();
    const stream = watch();

    transport.arm(stream);

    expect(await transport.sendMessages(sendOptions)).toBe(stream);
    await expect(transport.sendMessages(sendOptions)).rejects.toThrow(
      'The chat transport was not armed with a run watch.',
    );
  });

  it('should return no reconnect stream without consuming an armed watch', async () => {
    const transport = new BrowserPlacementChatTransport<MyUIMessage>();
    const stream = watch();

    transport.arm(stream);

    await expect(transport.reconnectToStream({ chatId: 'chat_watch' })).resolves.toBeNull();
    expect(await transport.sendMessages(sendOptions)).toBe(stream);
  });

  it('should disarm only the matching unconsumed watch', async () => {
    const transport = new BrowserPlacementChatTransport<MyUIMessage>();
    const first = watch();
    const replacement = watch();

    transport.arm(first);
    transport.disarm(replacement);
    expect(() => {
      transport.arm(replacement);
    }).toThrow('A chat watch is already armed.');

    transport.disarm(first);
    transport.arm(replacement);
    expect(await transport.sendMessages(sendOptions)).toBe(replacement);
  });
});
