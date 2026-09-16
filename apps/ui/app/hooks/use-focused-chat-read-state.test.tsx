// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat } from '@taucad/chat';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useFocusedChatReadState } from '#hooks/use-focused-chat-read-state.js';

vi.mock('@xstate/react', () => ({
  useSelector: <Snapshot, Selection>(
    actor: { getSnapshot: () => Snapshot },
    selector: (snapshot: Snapshot) => Selection,
  ): Selection => selector(actor.getSnapshot()),
}));
vi.mock('#hooks/use-chats.js', () => ({ useChats: vi.fn() }));
vi.mock('#hooks/use-project.js', () => ({ useProject: vi.fn() }));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: vi.fn() }));
/* The chat's own machine owns `read`/`unread` (S45); the durable record follows
 * it, so the hook tells both. */
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: vi.fn() }));

const chatsRef: { current: Chat[] } = { current: [] };
const setChatUnreadState = vi.fn().mockResolvedValue(undefined);
const markViewed = vi.fn();
const editorRef = { getSnapshot: () => ({ context: { focusedChatId: 'chat-focused' } }) };
let visibilityState: DocumentVisibilityState = 'visible';

const chat = (id: string, hasUnreadTurn: boolean): Chat => ({
  id,
  resourceId: 'project-1',
  name: id,
  messages: [],
  createdAt: 1,
  updatedAt: 1,
  recencyAt: 1,
  hasUnreadTurn,
});

describe('useFocusedChatReadState', () => {
  beforeEach(() => {
    chatsRef.current = [];
    visibilityState = 'visible';
    setChatUnreadState.mockReset().mockResolvedValue(undefined);
    markViewed.mockReset();
    vi.mocked(useChatSessionStore).mockReturnValue({ markViewed } as unknown as ReturnType<typeof useChatSessionStore>);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    vi.mocked(useProject).mockReturnValue({ projectId: 'project-1', editorRef } as unknown as ReturnType<
      typeof useProject
    >);
    vi.mocked(useChats).mockImplementation(
      () => ({ chats: chatsRef.current }) as unknown as ReturnType<typeof useChats>,
    );
    vi.mocked(useProjectManager).mockReturnValue({ setChatUnreadState } as unknown as ReturnType<
      typeof useProjectManager
    >);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears only the focused unread chat in an active document', () => {
    chatsRef.current = [chat('chat-background', true), chat('chat-focused', true)];

    renderHook(() => {
      useFocusedChatReadState();
    });

    expect(setChatUnreadState).toHaveBeenCalledOnce();
    expect(setChatUnreadState).toHaveBeenCalledWith('chat-focused', false);
    expect(markViewed).toHaveBeenCalledWith('chat-focused');
  });

  it('waits for focus before clearing unread state', async () => {
    vi.mocked(document.hasFocus).mockReturnValue(false);
    chatsRef.current = [chat('chat-focused', true)];
    renderHook(() => {
      useFocusedChatReadState();
    });
    expect(setChatUnreadState).not.toHaveBeenCalled();

    vi.mocked(document.hasFocus).mockReturnValue(true);
    await act(async () => {
      globalThis.dispatchEvent(new Event('focus'));
    });

    expect(setChatUnreadState).toHaveBeenCalledWith('chat-focused', false);
  });

  it('re-clears when a late completion marks the focused chat unread', () => {
    chatsRef.current = [chat('chat-focused', false)];
    const { rerender } = renderHook(() => {
      useFocusedChatReadState();
    });
    expect(setChatUnreadState).not.toHaveBeenCalled();

    chatsRef.current = [chat('chat-focused', true)];
    rerender();

    expect(setChatUnreadState).toHaveBeenCalledWith('chat-focused', false);
  });

  it('waits for document visibility before clearing unread state', async () => {
    visibilityState = 'hidden';
    chatsRef.current = [chat('chat-focused', true)];
    renderHook(() => {
      useFocusedChatReadState();
    });
    expect(setChatUnreadState).not.toHaveBeenCalled();

    visibilityState = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(setChatUnreadState).toHaveBeenCalledWith('chat-focused', false);
  });

  /* W20 pin (b): the sidebar's `unread` is the chat machine's `read` region and
   * this is the only thing that clears it. An unfocused or hidden document is
   * not somebody reading the chat, so neither the machine nor the record moves
   * — and there is no second read record anywhere. */
  it('never marks a background chat viewed, and never one in a hidden document', () => {
    chatsRef.current = [chat('chat-background', true), chat('chat-focused', true)];
    visibilityState = 'hidden';
    const hidden = renderHook(() => {
      useFocusedChatReadState();
    });
    expect(markViewed).not.toHaveBeenCalled();
    expect(setChatUnreadState).not.toHaveBeenCalled();
    hidden.unmount();

    visibilityState = 'visible';
    vi.mocked(document.hasFocus).mockReturnValue(false);
    renderHook(() => {
      useFocusedChatReadState();
    });
    expect(markViewed).not.toHaveBeenCalled();

    vi.mocked(document.hasFocus).mockReturnValue(true);
    act(() => {
      globalThis.dispatchEvent(new Event('focus'));
    });
    expect(markViewed).toHaveBeenCalledExactlyOnceWith('chat-focused');
  });
});
