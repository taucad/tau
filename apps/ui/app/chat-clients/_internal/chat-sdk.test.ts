import { expect, it, vi } from 'vitest';
import type * as Ai from 'ai';
import type * as ReactAi from '@ai-sdk/react';
import { loadChatSdk, requireChatSdk } from '#chat-clients/_internal/chat-sdk.js';

const loaded = vi.hoisted(() => ({ ai: vi.fn(), react: vi.fn() }));
vi.mock('ai', async (original) => {
  loaded.ai();
  return original<typeof Ai>();
});
vi.mock('@ai-sdk/react', async (original) => {
  loaded.react();
  return original<typeof ReactAi>();
});

it('does not load SDK code until demanded and shares concurrent admission', async () => {
  expect(loaded.ai).not.toHaveBeenCalled();
  expect(loaded.react).not.toHaveBeenCalled();
  expect(() => requireChatSdk()).toThrow('must finish loading');
  const first = loadChatSdk();
  const second = loadChatSdk();

  const sdk = await first;
  expect(await second).toBe(sdk);
  expect(requireChatSdk()).toBe(sdk);
  expect(await loadChatSdk()).toBe(sdk);
  expect(loaded.ai).toHaveBeenCalledOnce();
  expect(loaded.react).toHaveBeenCalledOnce();
  expect(sdk.react.Chat).toBeTypeOf('function');
});
