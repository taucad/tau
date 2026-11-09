import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { tauEditorPanelDragMime, tauFileDragMime, tauViewerPanelDragMime } from '@taucad/types/constants';
import { handleChatInputDrop } from '#components/tiptap/chat-input-drop-handler.js';

/**
 * The chat textarea container's React `onDrop` handler is the single source of
 * truth for the three custom drag MIME types. The Tiptap plugin must therefore:
 *
 *  - return `false` when no custom MIME is present (so ProseMirror's default
 *    text-drop behavior + the React handler both run normally), and
 *  - return `true` (and `preventDefault()`) when a custom MIME is present so
 *    ProseMirror does not eagerly insert garbage text from `dataTransfer`.
 */
describe('handleChatInputDrop — custom-mime passthrough contract', () => {
  const buildEvent = (mimeTypes: readonly string[]): DragEvent =>
    mock<DragEvent>({
      dataTransfer: mock<DataTransfer>({ types: [...mimeTypes] }),
      preventDefault: vi.fn(),
    });

  it('should return false when no DataTransfer is present', () => {
    // DragEvent.dataTransfer is `DataTransfer | null` per DOM spec; this
    // branch verifies the early-return guard for that legitimate null case.
    const event = mock<DragEvent>({ dataTransfer: null, preventDefault: vi.fn() });

    expect(handleChatInputDrop(undefined, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('should return false for plain text drops (passthrough to ProseMirror default)', () => {
    const event = buildEvent(['text/plain']);

    expect(handleChatInputDrop(undefined, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it.each([
    ['viewer panel mime', tauViewerPanelDragMime],
    ['editor panel mime', tauEditorPanelDragMime],
    ['file-tree mime', tauFileDragMime],
  ])('should intercept %s and prevent default without inserting nodes', (_label, mime) => {
    const event = buildEvent([mime]);

    const result = handleChatInputDrop(undefined, event);

    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});
