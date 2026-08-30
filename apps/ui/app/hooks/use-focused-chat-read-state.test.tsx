// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat } from '@taucad/chat';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
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

const chatsRef: { current: Chat[] } = { current: [] };
const setChatUnreadState = vi.fn().mockResolvedValue(undefined);
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
});
