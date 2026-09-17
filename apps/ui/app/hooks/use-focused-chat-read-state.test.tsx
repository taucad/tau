// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProject } from '#hooks/use-project.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import type { ChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import { useFocusedChatReadState } from '#hooks/use-focused-chat-read-state.js';
import { useComposerRecordToasts } from '#hooks/use-composer-record-toasts.js';

vi.mock('@xstate/react', () => ({
  useSelector: <Snapshot, Selection>(
    actor: { getSnapshot: () => Snapshot },
    selector: (snapshot: Snapshot) => Selection,
  ): Selection => selector(actor.getSnapshot()),
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: vi.fn() }));
/* Mocked only to prove the hook never reaches for a chat-row writer (W8). */
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: vi.fn() }));
/* D9: the store is the one writer of unread; the chat's `read` region, restored
 * from the store's record, is what the hook reads. */
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: vi.fn() }));
vi.mock('#hooks/use-sidebar-status.js', () => ({ useChatSidebarStatus: vi.fn() }));
vi.mock('#hooks/use-composer-record-toasts.js', () => ({ useComposerRecordToasts: vi.fn() }));

const unreadChats = new Set<string>();
const recordedUnread = new Set<string>();
const markViewed = vi.fn();
const focusChat = vi.fn();
const blurChat = vi.fn();
const unreadRecordRef = vi.fn((projectId: string) => ({ projectId }));
const editorRef = { getSnapshot: () => ({ context: { focusedChatId: 'chat-focused' } }) };
let visibilityState: DocumentVisibilityState = 'visible';

const status = (unread: boolean): ChatSidebarStatus => ({
  state: 'done',
  unread,
  toolName: undefined,
  pendingApprovalCount: 0,
  failureReason: undefined,
  branch: undefined,
  dirty: false,
});

describe('useFocusedChatReadState', () => {
  beforeEach(() => {
    unreadChats.clear();
    recordedUnread.clear();
    visibilityState = 'visible';
    markViewed.mockReset();
    focusChat.mockReset();
    blurChat.mockReset();
    vi.mocked(useProjectManager).mockReset();
    vi.mocked(useChatSessionStore).mockReturnValue({
      markViewed,
      focusChat,
      blurChat,
      unreadRecordRef,
      isUnread: (chatId: string) => recordedUnread.has(chatId),
    } as unknown as ReturnType<typeof useChatSessionStore>);
    vi.mocked(useChatSidebarStatus).mockImplementation((_projectId, chatId) => status(unreadChats.has(chatId)));
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    vi.mocked(useProject).mockReturnValue({ projectId: 'project-1', editorRef } as unknown as ReturnType<
      typeof useProject
    >);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears only the focused unread chat in an active document', () => {
    unreadChats.add('chat-background').add('chat-focused');

    renderHook(() => {
      useFocusedChatReadState();
    });

    expect(markViewed).toHaveBeenCalledExactlyOnceWith('chat-focused');
    expect(vi.mocked(useChatSidebarStatus)).toHaveBeenCalledWith('project-1', 'chat-focused');
  });

  it('waits for focus before clearing unread state', async () => {
    vi.mocked(document.hasFocus).mockReturnValue(false);
    unreadChats.add('chat-focused');
    renderHook(() => {
      useFocusedChatReadState();
    });
    expect(markViewed).not.toHaveBeenCalled();

    vi.mocked(document.hasFocus).mockReturnValue(true);
    await act(async () => {
      globalThis.dispatchEvent(new Event('focus'));
    });

    expect(markViewed).toHaveBeenCalledWith('chat-focused');
  });

  it('re-clears when a late completion marks the focused chat unread', () => {
    const { rerender } = renderHook(() => {
      useFocusedChatReadState();
    });
    expect(markViewed).not.toHaveBeenCalled();

    unreadChats.add('chat-focused');
    rerender();

    expect(markViewed).toHaveBeenCalledWith('chat-focused');
  });

  it('waits for document visibility before clearing unread state', async () => {
    visibilityState = 'hidden';
    unreadChats.add('chat-focused');
    renderHook(() => {
      useFocusedChatReadState();
    });
    expect(markViewed).not.toHaveBeenCalled();

    visibilityState = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(markViewed).toHaveBeenCalledWith('chat-focused');
  });

  /* W8 (D9): after a reload the unread record is the only witness, before the
   * chat's machine has been told. Focusing that chat clears it, through the
   * store alone — the hook has no chat-row writer to call. */
  it('clears a chat the unread record holds, through the store alone', () => {
    recordedUnread.add('chat-focused');

    renderHook(() => {
      useFocusedChatReadState();
    });

    expect(markViewed).toHaveBeenCalledExactlyOnceWith('chat-focused');
    expect(vi.mocked(useProjectManager)).not.toHaveBeenCalled();
  });

  it('should surface failures of the project unread record (G2)', () => {
    renderHook(() => {
      useFocusedChatReadState();
    });

    expect(unreadRecordRef).toHaveBeenCalledWith('project-1');
    expect(useComposerRecordToasts).toHaveBeenLastCalledWith({ projectId: 'project-1' });
  });

  it('should tell the store which chat is focused, and take it back on unmount (R3)', () => {
    const view = renderHook(() => {
      useFocusedChatReadState();
    });
    expect(focusChat).toHaveBeenCalledExactlyOnceWith('chat-focused');
    expect(blurChat).not.toHaveBeenCalled();

    view.unmount();

    expect(blurChat).toHaveBeenCalledExactlyOnceWith('chat-focused');
  });

  /* W20 pin (b): the sidebar's `unread` is the chat machine's `read` region and
   * this is the only thing that clears it. An unfocused or hidden document is
   * not somebody reading the chat, so neither the machine nor the record moves
   * — and there is no second read record anywhere. */
  it('never marks a background chat viewed, and never one in a hidden document', () => {
    unreadChats.add('chat-background').add('chat-focused');
    visibilityState = 'hidden';
    const hidden = renderHook(() => {
      useFocusedChatReadState();
    });
    expect(markViewed).not.toHaveBeenCalled();
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
