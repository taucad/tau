// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import {
  composerTraysOf,
  noComposerTrays,
  readRememberedComposerTrays,
  writeRememberedComposerTrays,
} from '#services/chat-composer-trays.js';

/** An assistant turn holding one task-list call, as the transcript materializes it. */
const taskListTurn = (
  id: string,
  items: readonly unknown[],
  state: 'output-available' | 'output-error' = 'output-available',
): MyUIMessage =>
  ({
    id,
    role: 'assistant',
    parts: [
      {
        type: 'tool-update_todos',
        toolCallId: `call-${id}`,
        state,
        input: { items },
        ...(state === 'output-available' ? { output: {} } : { errorText: 'refused' }),
      },
    ],
  }) as unknown as MyUIMessage;
const textTurn = (id: string): MyUIMessage => ({ id, role: 'user', parts: [{ type: 'text', text: id }] });
const item = { id: 'a', title: 'Model the cylinder', status: 'pending' };

describe('composer tray memory (U10)', () => {
  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it('remembers nothing for a chat it has not seen', () => {
    expect(readRememberedComposerTrays('chat_unseen')).toBe(noComposerTrays);
  });

  it('remembers a task-list tray per chat and forgets it when the chat has none', () => {
    writeRememberedComposerTrays('chat_a', ['todo']);
    expect(readRememberedComposerTrays('chat_a')).toEqual(['todo']);
    expect(readRememberedComposerTrays('chat_b')).toEqual([]);
    writeRememberedComposerTrays('chat_a', []);
    expect(readRememberedComposerTrays('chat_a')).toEqual([]);
  });

  it('reads the tray from the last completed task-list call, since each call replaces the list', () => {
    expect(composerTraysOf([textTurn('u1')])).toEqual([]);
    expect(composerTraysOf([textTurn('u1'), taskListTurn('a1', [item])])).toEqual(['todo']);
    // A later call that empties the list leaves no tray; a failed call wrote nothing.
    expect(composerTraysOf([taskListTurn('a1', [item]), taskListTurn('a2', [])])).toEqual([]);
    expect(composerTraysOf([taskListTurn('a1', [item]), taskListTurn('a2', [], 'output-error')])).toEqual(['todo']);
  });
});
