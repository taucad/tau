import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Button } from '@taucad/ui/components/button';
import { ChatActivitySummary } from '#components/chat/chat-activity-summary.js';
import { ActivityFoldContext } from '#components/chat/chat-activity-fold-context.js';

const foldDisabledValue = { disableInnerFold: true } as const;

type ChatActivitySectionProps = {
  /** Past-tense verb fragment, e.g. `"Explored"`. Rendered when the header is closed. */
  readonly summaryVerbPast: string;
  /** Present-participle counterpart, e.g. `"Exploring"`. Rendered when the header is open. */
  readonly summaryVerbActive: string;
  /** Detail fragment, e.g. `"12 searches, 2 fetches"`. Rendered de-emphasized when closed. */
  readonly summaryDetail: string;
  readonly children: React.ReactNode;
  /**
   * When true, the section defaults to collapsed — the final answer text is
   * already visible, so the activity trace can be tucked away.
   */
  readonly hasDownstreamText?: boolean;
  /**
   * Structural marker: this is the trailing activity in the message (no
   * downstream non-text run yet). Controls the default-open behavior so the
   * just-finished activity stays expanded after streaming concludes.
   */
  readonly isLast?: boolean;
  /**
   * Live marker: the chat is actively streaming this section right now. Drives
   * the present-participle verb (`Exploring…`); when `false` the header reverts
   * to the past-tense, two-tone summary (`Explored 12 searches, 2 fetches`).
   * Callers must combine `isLast` with the chat status (`'streaming'`) — a
   * structurally trailing section that has finished/cancelled is
   * `isLast=true, isActive=false`.
   */
  readonly isActive?: boolean;
};

/**
 * Outer fold for the entire activity prefix of an assistant message.
 * Wraps reasoning + aggregated tool groups in a single collapsible region.
 *
 * Uses controlled open state driven by `isLast` / `hasDownstreamText` (auto)
 * with user toggle override. The `isActive` prop is decoupled from `isLast`:
 * `isLast` controls default-open semantics (purely structural — the trailing
 * activity stays expanded so the user can see it after streaming ends), while
 * `isActive` controls the verb tense (`Exploring…` vs `Explored …`) and
 * should only be `true` while the chat is actually streaming this section.
 *
 * Header label matches the inner `ChatActivityGroup` header via the shared
 * {@link ChatActivitySummary} component so both fold levels share the same
 * verb/detail typography.
 */
export function ChatActivitySection({
  summaryVerbPast,
  summaryVerbActive,
  summaryDetail,
  children,
  hasDownstreamText = false,
  isLast = false,
  isActive = false,
}: ChatActivitySectionProps): React.JSX.Element {
  const [userToggleState, setUserToggleState] = useState<'expanded' | 'collapsed' | undefined>(undefined);

  const isOpen =
    userToggleState === 'expanded' ? true : userToggleState === 'collapsed' ? false : isLast || !hasDownstreamText;

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
          <ChevronRight className='size-3 shrink-0 text-foreground/60 transition duration-200 group-hover/chat-tool-trigger:text-foreground [[data-state=open]>&]:rotate-90' />
          <ChatActivitySummary
            verb={summaryVerbPast}
            verbActive={summaryVerbActive}
            detail={summaryDetail}
            isActive={isActive}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='flex flex-col pl-4'>
          <ActivityFoldContext.Provider value={foldDisabledValue}>{children}</ActivityFoldContext.Provider>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
