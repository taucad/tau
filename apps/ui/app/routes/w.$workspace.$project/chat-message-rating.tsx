import { useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { messageRole } from '@taucad/chat/constants';
import { Button } from '@taucad/ui/components/button';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChatContext, useChatSelector } from '#hooks/use-chat.js';
import { useProject } from '#hooks/use-project.js';
import { useTelemetryPurposes } from '#hooks/use-telemetry-purposes.js';
import type { RunRating } from '#services/chat-session-store.js';

/** Refusals the user's own rating answers: no feedback decision yet, one under an older notice, or a withdrawal. */
const answeredByRating = new Set(['no-decision', 'notice-superseded', 'withdrawn']);

const choices = [
  { value: 'positive', label: 'Good reply', Icon: ThumbsUp },
  { value: 'negative', label: 'Bad reply', Icon: ThumbsDown },
] as const;

/**
 * Rate the run that answered a turn (T12), under the last message of that turn, once the run has ended. Rating is the
 * feedback consent: while the account has not decided, the click records a feedback grant first and then rates. The
 * control is hidden while the project refuses feedback for another reason. A run is rated once, so the first choice
 * stands and the control then shows it.
 *
 * @param props - `messageId` is the turn's last message.
 * @returns The two rating buttons, or nothing.
 */
export function ChatMessageRating({ messageId }: Readonly<{ messageId: string }>): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const { activeChatId } = useChatContext();
  const store = useChatSessionStore();
  const { isAllowed, stateOf, canDecide, decide, isDeciding } = useTelemetryPurposes({ projectId });
  /* The turn's request opens its group; only the group's last message carries the control. */
  const turnId = useChatSelector((state) => {
    const group = state.turnGroups.find((candidate) => candidate.messageIds.includes(messageId));
    const first = group?.messageIds[0];
    return group?.messageIds.at(-1) === messageId &&
      first !== messageId &&
      state.messagesById.get(first ?? '')?.role === messageRole.user
      ? first
      : undefined;
  });
  /* Re-read on every status change: a run becomes ratable when it ends. */
  useChatSelector((state) => state.status);
  const runId = turnId === undefined ? undefined : store.ratableRun(activeChatId, turnId);
  const [chosen, setChosen] = useState<RunRating['value'] | undefined>(undefined);

  const allowed = isAllowed('feedback');
  const askable = canDecide && answeredByRating.has(stateOf('feedback').refusal ?? '');
  if (runId === undefined || !(allowed || askable)) {
    return undefined;
  }
  const rating = chosen ?? store.ratingOf(activeChatId, runId);
  const rate = async (value: RunRating['value']): Promise<void> => {
    if (!allowed) {
      try {
        await decide([{ purpose: 'feedback', granted: true }]);
      } catch {
        /* A refused decision leaves the reply unrated; the refetched answer decides whether to show the control. */
        return;
      }
    }
    setChosen(store.rateRun(activeChatId, runId, value));
  };

  return (
    <span className='flex flex-row items-center'>
      {choices.map(({ value, label, Icon }) => (
        <Button
          key={value}
          size='icon-xs'
          variant='ghost'
          className='pointer-coarse:size-8'
          aria-label={label}
          aria-pressed={rating === value}
          title={`${label} (shared with Tau to improve replies)`}
          disabled={isDeciding || (rating !== undefined && rating !== value)}
          onClick={async () => {
            await rate(value);
          }}
        >
          <Icon className={rating === value ? 'fill-current' : undefined} />
        </Button>
      ))}
    </span>
  );
}
