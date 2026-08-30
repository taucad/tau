import { describe, expect, it } from 'vitest';
import type { Chat } from '@taucad/chat';
import { defaultPanelState } from '#constants/editor.constants.js';
import { pickDuplicatedFocusedChatId } from '#hooks/object-store.worker.js';
import { mergePanelState } from '#utils/panel-state.utils.js';

function makeChat(overrides: Partial<Chat> & { id: string; updatedAt: number }): Chat {
  return {
    resourceId: 'resource_test',
    name: 'chat',
    messages: [],
    createdAt: overrides.updatedAt,
    ...overrides,
  };
}

describe('pickDuplicatedFocusedChatId', () => {
  it('returns undefined when no chats were cloned (caller skips the editor-state write)', () => {
    expect(
      pickDuplicatedFocusedChatId({
        sourceFocusedChatId: 'chatSource',
        chatIdMapping: { chatSource: 'chat_clone' },
        clonedChats: [],
      }),
    ).toBeUndefined();
  });

  it('returns the mapped clone of the source focused chat when present', () => {
    const clonedChats = [
      makeChat({ id: 'chat_a_clone', updatedAt: 10 }),
      makeChat({ id: 'chat_b_clone', updatedAt: 100 }),
    ];
    expect(
      pickDuplicatedFocusedChatId({
        sourceFocusedChatId: 'sourceChatOne',
        chatIdMapping: { sourceChatOne: 'chat_a_clone', sourceChatTwo: 'chat_b_clone' },
        clonedChats,
      }),
    ).toBe('chat_a_clone');
  });

  it('falls back to the most-recently-active cloned chat when source has no focused chat', () => {
    const clonedChats = [
      makeChat({ id: 'chat_old', updatedAt: 999, recencyAt: 1 }),
      makeChat({ id: 'chat_recent', updatedAt: 1, recencyAt: 999 }),
      makeChat({ id: 'chat_mid', updatedAt: 500, recencyAt: 500 }),
    ];
    expect(
      pickDuplicatedFocusedChatId({
        sourceFocusedChatId: undefined,
        chatIdMapping: {},
        clonedChats,
      }),
    ).toBe('chat_recent');
  });

  it('falls back to the most-recent clone when the source focused id is stale (not present in mapping)', () => {
    // Regression: under the old `duplicateProject` an unmapped focused id
    // produced `focusedChatId: undefined` on disk, which the editor-route
    // gate would then have to heal at load time — historically the
    // project-chat crash-loop's upstream producer.
    const clonedChats = [
      makeChat({ id: 'chat_first_clone', updatedAt: 1 }),
      makeChat({ id: 'chat_last_clone', updatedAt: 200 }),
    ];
    expect(
      pickDuplicatedFocusedChatId({
        sourceFocusedChatId: 'chat_already_deleted',
        chatIdMapping: { chatOther: 'chat_first_clone' },
        clonedChats,
      }),
    ).toBe('chat_last_clone');
  });
});

describe('mergePanelState', () => {
  it('adds Paneview defaults to older state while preserving supplied entries', () => {
    expect(
      mergePanelState(defaultPanelState, {
        kernelPaneview: { main: { isExpanded: false, size: 120 } },
        modelPaneview: { helper: { isExpanded: true, size: 200 } },
        consolePaneview: { main: { isExpanded: true, size: 160 } },
      }),
    ).toMatchObject({
      kernelPaneview: { main: { isExpanded: false, size: 120 } },
      modelPaneview: { helper: { isExpanded: true, size: 200 } },
      parametersPaneview: {},
      consolePaneview: { main: { isExpanded: true, size: 160 } },
    });

    expect(mergePanelState(defaultPanelState, { kernelPaneview: {} })).toMatchObject({ modelPaneview: {} });
  });
});
