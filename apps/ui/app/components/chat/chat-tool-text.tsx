import { cn } from '#utils/ui.utils.js';

// ============================================================================
// ChatToolAction
// ============================================================================

type ChatToolActionProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

/**
 * Low-level typography primitive for the verb fragment in tool displays
 * (e.g., `Read`, `Listed`, `Visited`).
 *
 * Prefer {@link ChatToolLabel} for new code — it composes the verb +
 * description pair with the correct inline spacing in one place. This
 * primitive remains exported for niche callers that render only a verb
 * without a description sibling.
 *
 * Lifts to `text-foreground` on hover when nested inside a parent that
 * declares the `group/chat-tool-trigger` Tailwind named group, matching
 * {@link ChatToolLabel}'s verb hover behaviour.
 *
 * @example <caption>standalone verb</caption>
 * ```tsx
 * <ChatToolAction>Read</ChatToolAction>
 * ```
 */
export function ChatToolAction({ children, className }: ChatToolActionProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'font-medium text-foreground/60 transition-colors group-hover/chat-tool-trigger:text-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ============================================================================
// ChatToolDescription
// ============================================================================

type ChatToolDescriptionProps = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

/**
 * Low-level typography primitive for the muted description fragment in tool
 * displays (e.g., file paths, durations, counts). Designed to be passed as the
 * child of {@link ChatToolLabel}, which inserts the literal space between the
 * verb and this description.
 *
 * Lifts to `text-foreground/80` on hover when nested inside a parent that
 * declares the `group/chat-tool-trigger` Tailwind named group, preserving the
 * verb-vs-description tonal hierarchy on hover (verb climbs to `/100`,
 * description to `/80`).
 *
 * **Truncation contract:** plain inline `<span>` with no truncate/min-width
 * classes. Truncation is owned exclusively by an ancestor block container
 * (e.g. `ChatToolCardTitle`'s `block min-w-0 truncate`) so the verb + this
 * description ellipsify as a single inline text run. An inline `truncate`
 * here would be a no-op (overflow:hidden is ignored on `display: inline`)
 * and would falsely imply this is the truncate owner.
 *
 * @example <caption>composed inside ChatToolLabel</caption>
 * ```tsx
 * <ChatToolLabel verb='Read'>
 *   <ChatToolDescription>main.kcl L1-10</ChatToolDescription>
 * </ChatToolLabel>
 * ```
 */
export function ChatToolDescription({ children, className }: ChatToolDescriptionProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'font-normal text-foreground/50 transition-colors group-hover/chat-tool-trigger:text-foreground/80',
        className,
      )}
    >
      {children}
    </span>
  );
}
