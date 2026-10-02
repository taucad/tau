import { expect, it, vi } from 'vitest';
import { createChatInstance } from '#chat-clients/_internal/shared-chat-transport.js';
import { BrowserPlacementChatTransport } from '#chat-clients/_internal/browser-agent-host-transport.js';

const observed = vi.hoisted(() => ({ options: undefined as Record<string, unknown> | undefined }));

vi.mock('@ai-sdk/react', () => {
  function mockChat(options: Record<string, unknown>): void {
    observed.options = options;
  }
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- third-party constructor name
    Chat: mockChat,
  };
});

it('does not let SDK approval responses start another request', () => {
  createChatInstance({
    chatId: 'chat-test',
    transport: new BrowserPlacementChatTransport(),
    onFinish: vi.fn(),
    onError: vi.fn(),
  });
  expect(observed.options).not.toHaveProperty('sendAutomaticallyWhen');
});

it('uses the chat-owned transport instead of a shared stream slot', () => {
  const transport = new BrowserPlacementChatTransport();
  createChatInstance({ chatId: 'chat-one', transport, onFinish: vi.fn(), onError: vi.fn() });
  expect(observed.options?.['transport']).toBe(transport);
});
