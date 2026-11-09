import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { tauEditorPanelDragMime, tauViewerPanelDragMime, tauFileDragMime } from '@taucad/types/constants';

const tauCustomDragMimes: readonly string[] = [tauEditorPanelDragMime, tauViewerPanelDragMime, tauFileDragMime];

/**
 * Returns `true` (and calls `event.preventDefault()`) when the drop carries
 * one of Tau's custom drag MIME types so that ProseMirror skips its default
 * drop handling and the parent container's React `onDrop` becomes the single
 * source of truth. Returns `false` otherwise so plain text / OS image drops
 * fall through to the default contenteditable behavior.
 *
 * Exported so it can be unit-tested directly without invoking Tiptap's
 * extension lifecycle.
 */
export const handleChatInputDrop = (_view: unknown, event: DragEvent): boolean => {
  const { dataTransfer } = event;
  if (!dataTransfer) {
    return false;
  }

  const hasCustomMime = tauCustomDragMimes.some((mime) => dataTransfer.types.includes(mime));
  if (!hasCustomMime) {
    return false;
  }

  event.preventDefault();
  return true;
};

/**
 * Tiptap extension that opts ProseMirror **out** of the chat textarea's
 * three custom drag MIME types (`tauEditorPanelDragMime`,
 * `tauViewerPanelDragMime`, `tauFileDragMime`).
 *
 * Why: the outer `<div ref={containerReference}>` in
 * `chat-textarea-{desktop,mobile}.tsx` is the single source of truth for
 * dispatching these drops (so dropping on padding / controls also works,
 * not just inside the contenteditable). If ProseMirror's default drop ran,
 * it would attempt to insert garbage text/nodes from `dataTransfer` before
 * the React handler had a chance to translate the payload into a screenshot
 * request or context-chip insertion.
 *
 * For every other drop (plain text, OS image files, etc.) the plugin returns
 * `false` so ProseMirror's default and the parent React handler run normally.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Tiptap extensions are PascalCase by convention
export const ChatInputDropHandler = Extension.create({
  name: 'chatInputDropHandler',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('chatInputDropHandler'),
        props: {
          handleDrop: handleChatInputDrop,
        },
      }),
    ];
  },
});
