/**
 * The composer trays a chat showed when it was last open on this device (U10, I21).
 *
 * A tray above the textarea reads its own file, which answers after the transcript. A chat that had one reserves its
 * height from this memory before either read answers, so the composer region does not grow when they do. The memory
 * is per chat and per device, like the task list's fold, and is best effort: a blocked or absent store (a server
 * render) remembers nothing.
 */

import type { MyUIMessage } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';

/** A tray above the textarea that a chat can remember having shown. */
export type ComposerTray = 'todo';

/** No tray: shared, so a selection that holds it stays equal across reads. */
export const noComposerTrays: readonly ComposerTray[] = Object.freeze([]);
const taskListTray: readonly ComposerTray[] = Object.freeze(['todo']);

const storageKey = (chatId: string): string => `tau:chat-composer-trays:${chatId}`;

/**
 * Read what this device remembers for a chat.
 *
 * @param chatId - The chat.
 * @returns The trays it showed when last open, or none.
 */
export const readRememberedComposerTrays = (chatId: string): readonly ComposerTray[] => {
  try {
    return globalThis.localStorage.getItem(storageKey(chatId)) === 'todo' ? taskListTray : noComposerTrays;
  } catch {
    return noComposerTrays;
  }
};

/**
 * Remember a chat's trays on this device.
 *
 * @param chatId - The chat.
 * @param trays - The trays its settled transcript has.
 */
export const writeRememberedComposerTrays = (chatId: string, trays: readonly ComposerTray[]): void => {
  try {
    if (trays.length === 0) {
      globalThis.localStorage.removeItem(storageKey(chatId));
    } else {
      globalThis.localStorage.setItem(storageKey(chatId), trays.join(' '));
    }
  } catch {
    // The memory is best effort; a blocked store must not break the transcript.
  }
};

const taskListPartType = `tool-${toolName.updateTodos}` as const;

/** A tool part of the task-list tool, static or dynamic, whose call completed. */
const completedTaskListInput = (part: MyUIMessage['parts'][number]): unknown => {
  if (part.type === taskListPartType) {
    return part.state === 'output-available' ? part.input : undefined;
  }
  if (part.type === 'dynamic-tool' && part.toolName === toolName.updateTodos) {
    return part.state === 'output-available' ? part.input : undefined;
  }
  return undefined;
};

/**
 * The trays a settled transcript has. The task-list tool replaces the whole list, so its last completed call says
 * whether the chat has a task list: one with items shows its tray.
 *
 * @param messages - The chat's settled transcript.
 * @returns The trays it shows.
 */
export const composerTraysOf = (messages: readonly MyUIMessage[]): readonly ComposerTray[] => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const { parts } = messages[index]!;
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
      const input = completedTaskListInput(parts[partIndex]!);
      if (input !== undefined) {
        const { items } = input as { readonly items?: readonly unknown[] };
        return Array.isArray(items) && items.length > 0 ? taskListTray : noComposerTrays;
      }
    }
  }
  return noComposerTrays;
};
