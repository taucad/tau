import { expect, it, vi } from 'vitest';
import { createChatInstance } from '#chat-clients/_internal/shared-chat-transport.js';

const observed = vi.hoisted(() => ({ options: undefined as Record<string, unknown> | undefined }));

vi.mock('@ai-sdk/react', () => ({
  Chat: class {
    public constructor(options: Record<string, unknown>) {
      observed.options = options;
    }
  },
}));

it('does not let SDK approval responses start another request', () => {
  createChatInstance({ chatId: 'chat-test', onFinish: vi.fn(), onError: vi.fn() });
  expect(observed.options).not.toHaveProperty('sendAutomaticallyWhen');
});
