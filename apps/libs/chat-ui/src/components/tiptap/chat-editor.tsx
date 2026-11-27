import { chatComposerEditorTextClassName } from '#components/chat-input-styles.js';
import { memo } from 'react';
import { EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { cn } from '@taucad/ui/utils/cn';
import { ContextSuggestionDropdown } from '#components/tiptap/context-suggestion.js';
import { SlashCommandDropdown } from '#components/tiptap/slash-command-suggestion.js';
import type {
  ContextSuggestionItem,
  SlashCommandItem,
  SuggestionPopupState,
} from '#components/tiptap/suggestion-types.js';

/**
 * Tailwind overrides for TipTap's `.tiptap` editor element (no separate CSS file).
 * Uses `[&_selector]:utility` arbitrary variants following the dockview.tsx pattern.
 */
const tiptapTailwindOverrides = cn(
  '[&_.tiptap]:outline-none',
  '[&_.tiptap_p]:m-0',
  '[&_.tiptap_p.is-editor-empty:first-child::before]:[content:attr(data-placeholder)]',
  '[&_.tiptap_p.is-editor-empty:first-child::before]:float-left',
  '[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground',
  '[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none',
  '[&_.tiptap_p.is-editor-empty:first-child::before]:h-0',
);

export type ChatEditorProps = {
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Tiptap returns null for uninitialized editor
  readonly editor: Editor | null;
  readonly className?: string;
  readonly contextSuggestionState: SuggestionPopupState<ContextSuggestionItem> | undefined;
  readonly slashCommandState: SuggestionPopupState<SlashCommandItem> | undefined;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly contextKeydownRef: React.RefObject<((event: KeyboardEvent) => boolean) | undefined>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly slashKeydownRef: React.RefObject<((event: KeyboardEvent) => boolean) | undefined>;
  /**
   * When true, the contenteditable text breathes with the shared `animate-shiny-text` opacity pulse so the
   * user's just-submitted message visibly reads as "in flight" while the chat status is `'submitted'`. Caller is
   * responsible for also disabling Tiptap editing via `editor.setEditable(false)` so the text can't be mutated
   * mid-flight.
   */
  readonly isLoading?: boolean;
};

// In-flight treatment applied to the inner `.tiptap` contenteditable while `isLoading` is true. It is the same
// opacity pulse as `AnimatedShinyText`, so the composer text reads as live and matches the planning indicator; a
// pulse runs on the compositor, where the earlier `background-clip: text` gradient repainted every frame.
const tiptapShimmerOverrides = cn(
  '[&_.tiptap]:animate-shiny-text',
  // F12: the pulse holds still under reduced motion.
  'motion-reduce:[&_.tiptap]:animate-none',
);

export const ChatEditor = memo(function ChatEditor({
  editor,
  className,
  contextSuggestionState,
  slashCommandState,
  contextKeydownRef,
  slashKeydownRef,
  isLoading = false,
}: ChatEditorProps): React.JSX.Element {
  return (
    <>
      <EditorContent
        editor={editor}
        className={cn(
          tiptapTailwindOverrides,
          // Shared with Home's native stand-in, so the swap between them moves no text (R2).
          chatComposerEditorTextClassName,
          isLoading && tiptapShimmerOverrides,
          className,
        )}
      />

      {contextSuggestionState ? (
        <ContextSuggestionDropdown state={contextSuggestionState} keydownHandlerRef={contextKeydownRef} />
      ) : undefined}

      {slashCommandState ? (
        <SlashCommandDropdown state={slashCommandState} keydownHandlerRef={slashKeydownRef} />
      ) : undefined}
    </>
  );
});
