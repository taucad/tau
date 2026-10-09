// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChats, useProjectChatUsage } from '#hooks/use-chats.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';

vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: vi.fn() }));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
});

it('does not expose another project metadata failure on a healthy scoped chat query', async () => {
  const store = mock<ChatSessionStore>();
  const manager = mock<ReturnType<typeof useProjectManager>>();
  manager.metadataObservationError = 'Sibling watch refused';
  manager.isLoading = false;
  manager.getChatsForResource.mockResolvedValue([]);
  vi.mocked(useChatSessionStore).mockReturnValue(store);
  vi.mocked(useProjectManager).mockReturnValue(manager);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useChats('healthy-project'), { wrapper });
  try {
    await waitFor(() => {
      expect(view.result.current.isLoading).toBe(false);
    });
    expect(manager.getChatsForResource).toHaveBeenCalledWith('healthy-project', { includeDeleted: false });
    expect(view.result.current.chats).toEqual([]);
    expect(view.result.current.error).toBeUndefined();
  } finally {
    view.unmount();
    client.clear();
  }
});

it('stops a live writer before purging and invalidates collection and row caches after success', async () => {
  const store = mock<ChatSessionStore>();
  const manager = mock<ReturnType<typeof useProjectManager>>();
  const stopped = Promise.withResolvers<void>();
  store.removeChat.mockImplementation(async () => stopped.promise);
  manager.purgeChat.mockResolvedValue();
  vi.mocked(useChatSessionStore).mockReturnValue(store);
  vi.mocked(useProjectManager).mockReturnValue(manager);
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useChats('project', { enabled: false }), { wrapper });
  const purge = result.current.purgeChat('chat');
  expect(store.removeChat).toHaveBeenCalledWith('chat');
  expect(manager.purgeChat).not.toHaveBeenCalled();
  stopped.resolve();
  await purge;
  expect(manager.purgeChat).toHaveBeenCalledWith('chat');
  expect(manager.getChatsForResource).not.toHaveBeenCalled();
  expect(invalidate.mock.calls).toEqual([
    [{ queryKey: ['chats', 'project'] }],
    [{ queryKey: ['all-chats'] }],
    [{ queryKey: ['chat', 'chat'] }],
  ]);
});

it.each(['stop', 'purge'])('propagates %s failure without invalidating caches', async (failure) => {
  const store = mock<ChatSessionStore>();
  const manager = mock<ReturnType<typeof useProjectManager>>();
  store.removeChat.mockResolvedValue();
  manager.purgeChat.mockResolvedValue();
  if (failure === 'stop') {
    store.removeChat.mockRejectedValue(new Error('stop failed'));
  } else {
    manager.purgeChat.mockRejectedValue(new Error('purge failed'));
  }
  vi.mocked(useChatSessionStore).mockReturnValue(store);
  vi.mocked(useProjectManager).mockReturnValue(manager);
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useChats('project', { enabled: false }), { wrapper });
  await expect(result.current.purgeChat('chat')).rejects.toThrow(`${failure} failed`);
  if (failure === 'stop') {
    expect(manager.purgeChat).not.toHaveBeenCalled();
  }
  expect(invalidate).not.toHaveBeenCalled();
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

it('should reread usage when a projection changes during the active materialization', async () => {
  const store = mock<ChatSessionStore>();
  const listeners = new Set<() => void>();
  const first = Promise.withResolvers<Awaited<ReturnType<ChatSessionStore['getHistoricalUsage']>>>();
  const second = Promise.withResolvers<Awaited<ReturnType<ChatSessionStore['getHistoricalUsage']>>>();
  const oldUsage = {
    operationIds: ['old'],
    lastActivityAt: 1,
    inputTokens: 2,
    outputTokens: 3,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    parts: 1,
  };
  const newUsage = { ...oldUsage, operationIds: ['old', 'new'], outputTokens: 5 };
  store.observe.mockReturnValue(() => undefined);
  store.subscribeProjection.mockImplementation((_chatId, listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  store.getAttachmentStatus.mockReturnValue('attached');
  store.historicalUsageReady.mockReturnValue(true);
  store.getHistoricalUsage
    .mockImplementationOnce(async () => first.promise)
    .mockImplementationOnce(async () => second.promise);
  vi.mocked(useChatSessionStore).mockReturnValue(store);

  const chatIds = ['chat'];
  const { result, unmount } = renderHook(() => useProjectChatUsage('project', chatIds));
  await waitFor(() => {
    expect(store.getHistoricalUsage).toHaveBeenCalledTimes(1);
  });
  act(() => {
    for (let notification = 0; notification < 100; notification++) {
      for (const listener of listeners) {
        listener();
      }
    }
  });
  await act(async () => {
    first.resolve(oldUsage);
    await first.promise;
  });
  await waitFor(() => {
    expect(store.getHistoricalUsage).toHaveBeenCalledTimes(2);
  });
  expect(result.current.has('chat')).toBe(false);
  await act(async () => {
    second.resolve(newUsage);
    await second.promise;
  });
  await waitFor(() => {
    expect(result.current.get('chat')?.operationIds).toEqual(['old', 'new']);
  });
  expect(store.getHistoricalUsage).toHaveBeenCalledTimes(2);
  unmount();
});
