// @vitest-environment jsdom
/**
 * Naming the chat a receipt was spent in, without opening every project.
 *
 * The usage page has no chat context of its own, and the global inventory
 * (`getAllChats`) opens each project this device holds. A receipt carries the
 * project as well as the chat, so exactly one project's storage is read, and
 * only once a reader opens the row.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getChatsForResource = vi.hoisted(() => vi.fn());
const getAllChats = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ getChatsForResource, getAllChats }),
}));

const { useChatName } = await import('#routes/usage/use-chat-name.js');
const { chatLabel } = await import('#routes/usage/activity-names.js');

const wrapper = ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const chat = (id: string, name: string): unknown => ({ id, name, resourceId: 'proj_gearbox', messages: [] });

beforeEach(() => {
  vi.clearAllMocks();
  getChatsForResource.mockResolvedValue([chat('chat_one', 'Bracket redesign'), chat('chat_two', 'Gear ratios')]);
});

describe('useChatName', () => {
  it('names the chat from the one project the receipt points at', async () => {
    const { result } = renderHook(() => useChatName('proj_gearbox', 'chat_two'), { wrapper });

    expect(result.current).toBeUndefined();
    await waitFor(() => {
      expect(result.current).toBe('Gear ratios');
    });
    expect(getChatsForResource).toHaveBeenCalledWith('proj_gearbox', { includeDeleted: true });
    expect(getAllChats).not.toHaveBeenCalled();
  });

  it('settles on nothing when this device does not hold the chat', async () => {
    const { result } = renderHook(() => useChatName('proj_gearbox', 'chat_elsewhere'), { wrapper });

    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });

  it('settles on nothing rather than retrying when storage cannot answer', async () => {
    getChatsForResource.mockRejectedValue(new Error('storage unavailable'));

    const { result } = renderHook(() => useChatName('proj_gearbox', 'chat_two'), { wrapper });

    await waitFor(() => {
      expect(result.current).toBeNull();
    });
    expect(getChatsForResource).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: 'no chat', projectHint: 'proj_gearbox', chatHint: null },
    { label: 'no project to look in', projectHint: null, chatHint: 'chat_two' },
  ])('reads nothing at all when the receipt has $label', ({ projectHint, chatHint }) => {
    const { result } = renderHook(() => useChatName(projectHint, chatHint), { wrapper });

    expect(result.current).toBeNull();
    expect(getChatsForResource).not.toHaveBeenCalled();
  });

  /*
   * `null` here means "nothing was looked up", not "looked and found nothing",
   * and the two must not render the same: the label tells them apart by whether
   * there was a project to look in at all.
   */
  it('never lets a lookup that never happened read as an absent chat', () => {
    const { result } = renderHook(() => useChatName(null, 'chat_two'), { wrapper });

    expect(chatLabel({ projectHint: null, chatHint: 'chat_two' }, result.current)).toBe('Chat name not available');
  });
});
