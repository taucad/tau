import { useEffect } from 'react';
import type { MyMessagePart } from '@taucad/chat';
import { messageRole } from '@taucad/chat/constants';
import { cn } from '@taucad/ui/utils/cn';
import { ChatActivitySpinner, warmChatActivitySpinner } from '#components/chat/chat-activity-spinner.js';
import { useChatContext, useChatRetrySnapshot, useChatSelector } from '#hooks/use-chat.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { useProject } from '#hooks/use-project.js';
import { useChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import { selectChatActivityCue } from '#utils/chat-activity-cue.js';
import { findLastMeaningfulPartIndex, isActivityPartActive } from '#utils/assistant-message-activity.js';

type ChatMessagePlanningProperties = {
  readonly messageId: string;
  readonly className?: string;
};

const stateOf = (part: MyMessagePart): unknown => Reflect.get(part, 'state');

/**
 * Whether the trailing assistant message already shows that work is happening
 * (chat activity indicator closeout R3).
 *
 * Only the last meaningful part can be streaming visibly: an earlier part left
 * `streaming` behind later tools is history, which is the shape an ACP
 * checkpoint leaves. A blank thought shows nothing. A running tool shows its
 * own loading card, or the spinner on its collapsed group; a pending approval
 * has its banner. An answered approval has no cue of its own until the run
 * resumes.
 *
 * @param parts - The trailing assistant message's parts.
 * @returns `true` when something on screen already moves.
 * @public
 */
export const hasLiveSurface = (parts: readonly MyMessagePart[]): boolean => {
  const tail = parts[findLastMeaningfulPartIndex(parts)];
  if ((tail?.type === 'text' || tail?.type === 'reasoning') && tail.state === 'streaming' && tail.text.trim() !== '') {
    return true;
  }
  return parts.some(
    (part) =>
      stateOf(part) === 'approval-requested' || (isActivityPartActive(part) && stateOf(part) !== 'approval-responded'),
  );
};

/**
 * The one "still working" cue at the bottom of the chat history.
 *
 * The run state decides whether the turn is live (R1); the trailing message's
 * parts only decide whether something else already shows it (R3). A paused
 * run belongs to the person until they answer, so it speaks only once an
 * approval is answered and the run has not resumed yet.
 */
export function ChatMessagePlanning({
  messageId,
  className,
}: ChatMessagePlanningProperties): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const { activeChatId } = useChatContext();
  const run = useChatSidebarStatus(projectId, activeChatId);
  const chatStatus = useChatSelector((state) => state.status);
  const { retryAttempt, retryMaxAttempts } = useChatRetrySnapshot();
  const trailing = useChatSelector((state) => {
    const last = state.messages.at(-1);
    if (last?.id !== messageId) {
      return undefined;
    }
    if (last.role !== messageRole.assistant) {
      return { isLive: false, isAnswered: false };
    }
    return {
      isLive: hasLiveSurface(last.parts),
      isAnswered: last.parts.some((part) => stateOf(part) === 'approval-responded'),
    };
  });
  const cue = selectChatActivityCue({ runState: run?.state, chatStatus, retryAttempt, retryMaxAttempts });
  const { theme } = useTheme();
  // The cue is suppressed while another surface shows the work (R3), so a live turn is the earliest honest
  // moment to build the spinner's renderer: by the time the parts settle and this row appears, it is warm.
  const isTurnLive = cue !== undefined || chatStatus === 'submitted' || chatStatus === 'streaming';

  useEffect(() => {
    if (!isTurnLive) {
      return;
    }
    void warmChatActivitySpinner(theme === Theme.DARK ? 'dark' : 'light');
  }, [isTurnLive, theme]);

  if (!cue || !trailing) {
    return undefined;
  }
  if (cue.kind !== 'reconnecting' && trailing.isLive) {
    return undefined;
  }
  if (cue.kind === 'waiting' && !trailing.isAnswered) {
    return undefined;
  }

  return (
    <div
      role='status'
      className={cn(
        '-ml-2 flex h-6 min-w-0 items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      <ChatActivitySpinner />
      <span className='min-w-0 truncate'>{cue.sentence}</span>
    </div>
  );
}
