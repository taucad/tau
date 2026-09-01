import { memo } from 'react';
import { EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { cn } from '@taucad/ui/utils/cn';
import { ContextSuggestionDropdown } from '#components/chat/tiptap/context-suggestion.js';
import { SlashCommandDropdown } from '#components/chat/tiptap/slash-command-suggestion.js';
import type {
  ContextSuggestionItem,
  SlashCommandItem,
  SuggestionPopupState,
} from '#components/chat/tiptap/suggestion-types.js';

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
   * When true, paints the contenteditable text with the shared
   * `animate-shiny-text` shimmer gradient (bg-clip-text +
   * text-transparent) so the user's just-submitted message visibly reads
   * as "in flight" while the chat status is `'submitted'`. Caller is
   * responsible for also disabling Tiptap editing via
   * `editor.setEditable(false)` so the text can't be mutated mid-flight.
   */
  readonly isLoading?: boolean;
};

// Shimmer treatment applied to the inner `.tiptap` contenteditable while
// `isLoading` is true. Mirrors the gradient stack used by
// `AnimatedShinyText` so the composer text reads as live and matches the
// `Planning next moves...` indicator from `chat-message-planning.tsx`.
const tiptapShimmerOverrides = cn(
  '[&_.tiptap]:bg-clip-text [&_.tiptap]:text-transparent',
  '[&_.tiptap]:animate-shiny-text [&_.tiptap]:bg-repeat [&_.tiptap]:[background-size:170%_100%]',
  '[&_.tiptap]:bg-gradient-to-r [&_.tiptap]:from-foreground/30 [&_.tiptap]:via-foreground [&_.tiptap]:via-25% [&_.tiptap]:to-foreground/30 [&_.tiptap]:to-50%',
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
          'mb-10 size-full max-h-48 min-h-6 overflow-y-auto',
          'px-3 pb-3 pt-2',
          'text-sm',
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
