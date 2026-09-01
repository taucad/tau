import { cn } from '@taucad/ui/utils/cn';

type ChatToolLabelProps = {
  /**
   * Verb fragment displayed in emphasised typography, e.g. `"Read"`,
   * `"Explored"`, `"Searching"`. Accepts a `ReactNode` so callers can layer
   * additional inline styling (e.g. a mono span for a regex pattern); the
   * outer typography wrapper still applies the canonical `font-medium
   * text-foreground/60` treatment so colours stay in sync across the chat.
   * Always rendered.
   */
  readonly verb: React.ReactNode;
  /**
   * Optional detail node rendered after the verb separated by a single literal
   * space character. Typically a `ChatToolDescription`, a `FileLink`, or a
   * styled inline span. Pass `undefined` (or no children) to render the verb on
   * its own.
   */
  readonly children?: React.ReactNode;
  /** Optional className applied to the outer inline wrapper. */
  readonly className?: string;
};

/**
 * Shared verb + detail label for every chat-tool header row (tool cards,
 * activity summaries, the reasoning Brain button).
 *
 * Lays out the verb and detail as inline text separated by a literal space —
 * **not** a CSS `gap` — so the pair reads as one natural phrase that matches
 * the surrounding chat text rhythm. Owning this typography in one place means
 * adjusting the verb colour, weight, or spacing only ever requires touching
 * this file.
 *
 * **Truncation contract:** the wrapper is a plain inline `<span>` with **no**
 * truncate/min-width classes. Truncation is owned exclusively by an ancestor
 * block container (e.g. `ChatToolCardTitle`'s `block min-w-0 truncate`) so the
 * entire verb + detail phrase ellipsifies as a single inline text run. Any
 * inline `truncate` on this wrapper would be a no-op (overflow:hidden is
 * ignored on `display: inline`) and would falsely imply this is the truncate
 * owner — so it is deliberately omitted.
 *
 * **Hover affordance:** when the label lives inside a parent that declares the
 * `group/chat-tool-trigger` Tailwind named group (every clickable chat-tool
 * header — activity section/group, tool-card header, reasoning Brain button),
 * the verb lifts from `text-foreground/60` to `text-foreground` and the
 * accompanying `ChatToolDescription` lifts from `text-foreground/50` to
 * `text-foreground/80`, giving a single consistent "this is clickable" cue
 * everywhere without touching the parent's own colour rules.
 *
 * @example <caption>verb + plain text detail</caption>
 * ```tsx
 * <ChatToolLabel verb='Read'>main.kcl</ChatToolLabel>
 * ```
 *
 * @example <caption>verb + ChatToolDescription</caption>
 * ```tsx
 * <ChatToolLabel verb='Searched'>
 *   <ChatToolDescription>
 *     <span className='italic'>{query}</span>
 *   </ChatToolDescription>
 * </ChatToolLabel>
 * ```
 *
 * @example <caption>verb only</caption>
 * ```tsx
 * <ChatToolLabel verb='All tests passed' />
 * ```
 */
export function ChatToolLabel({ verb, children, className }: ChatToolLabelProps): React.JSX.Element {
  const hasDetail = children !== undefined && children !== null && children !== false && children !== '';

  return (
    <span className={cn(className)}>
      <span className='font-medium text-foreground/60 transition-colors group-hover/chat-tool-trigger:text-foreground'>
        {verb}
      </span>
      {hasDetail ? <> {children}</> : undefined}
    </span>
  );
}
