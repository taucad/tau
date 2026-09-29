// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useProjectChatUsage } from '#hooks/use-chats.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';

vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
});

it('starts at most four history observations and releases each slot after its complete read', async () => {
  const store = mock<ChatSessionStore>();
  const listeners = new Map<string, Set<() => void>>();
  const ready = new Set<string>();
  let active = 0;
  let peak = 0;
  store.observe.mockImplementation(() => {
    active++;
    peak = Math.max(peak, active);
    return () => {
      active--;
    };
  });
  store.subscribeProjection.mockImplementation((chatId, listener) => {
    const bucket = listeners.get(chatId) ?? new Set();
    bucket.add(listener);
    listeners.set(chatId, bucket);
    return () => {
      bucket.delete(listener);
    };
  });
  store.getAttachmentStatus.mockReturnValue('attached');
  store.historicalUsageReady.mockImplementation((chatId) => ready.has(chatId));
  store.getHistoricalUsage.mockResolvedValue({
    operationIds: [],
    lastActivityAt: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    parts: 0,
  });
  vi.mocked(useChatSessionStore).mockReturnValue(store);
  const chatIds = ['one', 'two', 'three', 'four', 'five', 'six'];
  const { result, unmount } = renderHook(() => useProjectChatUsage('project', chatIds));
  expect(store.observe).toHaveBeenCalledTimes(4);
  expect(peak).toBe(4);

  act(() => {
    for (let notification = 0; notification < 100; notification++) {
      for (const listener of listeners.get('one') ?? []) {
        listener();
      }
    }
  });
  expect(store.observe).toHaveBeenCalledTimes(4);

  act(() => {
    ready.add('one');
    for (const listener of listeners.get('one') ?? []) {
      listener();
    }
  });
  await waitFor(() => {
    expect(result.current.has('one')).toBe(true);
    expect(store.observe).toHaveBeenCalledTimes(5);
  });
  expect(peak).toBe(4);
  expect(store.observe.mock.calls.filter(([chatId]) => chatId === 'one')).toHaveLength(1);
  expect(store.getHistoricalUsage.mock.calls.filter(([chatId]) => chatId === 'one')).toHaveLength(1);
  unmount();
  await waitFor(() => {
    expect(active).toBe(0);
  });
});

it('retries a slow history read after its observation slot times out', async () => {
  vi.useFakeTimers();
  const store = mock<ChatSessionStore>();
  let ready = false;
  let active = 0;
  store.observe.mockImplementation(() => {
    active++;
    return () => {
      active--;
    };
  });
  store.subscribeProjection.mockReturnValue(() => undefined);
  store.getAttachmentStatus.mockReturnValue('attached');
  store.historicalUsageReady.mockImplementation(() => ready);
  store.getHistoricalUsage.mockResolvedValue({
    operationIds: ['late'],
    lastActivityAt: 1,
    inputTokens: 2,
    outputTokens: 3,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    parts: 1,
  });
  vi.mocked(useChatSessionStore).mockReturnValue(store);
  const chatIds = ['slow'];
  const { result, unmount } = renderHook(() => useProjectChatUsage('project', chatIds));
  expect(active).toBe(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(active).toBe(0);
  expect(result.current.has('slow')).toBe(false);

  ready = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(store.observe).toHaveBeenCalledTimes(2);
  expect(result.current.get('slow')?.operationIds).toEqual(['late']);
  expect(active).toBe(0);
  unmount();
});
