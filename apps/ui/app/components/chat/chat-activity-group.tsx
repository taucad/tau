import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Button } from '@taucad/ui/components/button';
import { ChatActivitySummary } from '#components/chat/chat-activity-summary.js';
import { useActivityFoldContext } from '#components/chat/chat-activity-fold-context.js';

type ChatActivityGroupProps = {
  /** Past-tense verb fragment, e.g. `"Explored"`. Rendered when the header is closed. */
  readonly summaryVerbPast: string;
  /** Present-participle counterpart, e.g. `"Exploring"`. Rendered when the header is open. */
  readonly summaryVerbActive: string;
  /** Detail fragment, e.g. `"5 files, 1 search"`. Rendered de-emphasized when closed. */
  readonly summaryDetail: string;
  readonly children: React.ReactNode;
  readonly icon?: LucideIcon;
  /**
   * Live marker: this is the trailing group AND the chat is actively streaming
   * it right now. While `true` (and the user has not explicitly collapsed),
   * children render inline with no header, no border, and no indent — matching
   * Cursor's streaming research UX. When the chat finishes/cancels, callers
   * flip this to `false` and the group naturally collapses to its past-tense
   * summary header (`Explored …`); no special end-of-stream code path needed.
   * The user can still explicitly toggle the header (escape hatch).
   */
  readonly isActive?: boolean;
};

/**
 * Inner fold for an aggregated tool group.
 *
 * Three render modes (checked in order):
 * - **Wrapped (`disableInnerFold=true` from {@link useActivityFoldContext}):**
 *   an ancestor (e.g. `ChatActivitySection`) is the canonical outer fold and
 *   already carries the summary, so this group renders children inline with no
 *   chrome at all. The user toggle does not surface a header in this mode —
 *   the ancestor's toggle is the user's control surface.
 * - **Live (`isActive=true` and not user-collapsed):** children render inline
 *   with no chrome at all — matches Cursor's streaming research UX where the
 *   latest group is visually flat until a downstream part (or end-of-stream)
 *   closes it. Verb tense is present-participle (`Exploring…`) when the user
 *   has explicitly collapsed mid-stream.
 * - **Closed (`isActive=false`, or user collapsed a live group):** a one-line
 *   two-tone summary header (verb + detail) with a chevron expands to reveal
 *   the same children flat (no border, no indent). Past-tense verb
 *   (`Explored …`) once `isActive` flips to `false`.
 *
 * User toggles are persistent across `isActive` transitions: once a user
 * explicitly opens or closes the group, that preference wins over the
 * automatic `isActive` behavior.
 */
export function ChatActivityGroup({
  summaryVerbPast,
  summaryVerbActive,
  summaryDetail,
  children,
  icon: Icon,
  isActive = false,
}: ChatActivityGroupProps): React.ReactNode {
  const { disableInnerFold } = useActivityFoldContext();
  const [userToggleState, setUserToggleState] = useState<'expanded' | 'collapsed' | undefined>(undefined);

  if (disableInnerFold) {
    return children;
  }

  if (isActive && userToggleState !== 'collapsed') {
    return children;
  }

  const isOpen = userToggleState === 'expanded';

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setUserToggleState(nextOpen ? 'expanded' : 'collapsed');
      }}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          className='group/chat-tool-trigger -ml-2 flex w-full min-w-0 items-center justify-start gap-1.5 overflow-hidden hover:bg-transparent dark:hover:bg-transparent'
        >
          {Icon && (
            <Icon
              aria-hidden='true'
              className='size-3 shrink-0 text-muted-foreground group-hover/chat-tool-trigger:text-foreground'
            />
          )}
          <span className='min-w-0 truncate'>
            <ChatActivitySummary
              verb={summaryVerbPast}
              verbActive={summaryVerbActive}
              detail={summaryDetail}
              isActive={isActive}
            />
          </span>
          <ChevronRight
            aria-hidden='true'
            className='size-3 shrink-0 text-foreground/60 transition duration-200 group-hover/chat-tool-trigger:text-foreground [[data-state=open]>&]:rotate-90'
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='ml-4 flex flex-col'>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
