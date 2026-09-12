import { memo, useEffect, useMemo, useReducer } from 'react';
import { Coins, Clock } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { useChatSelector } from '#hooks/use-chat.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { cn } from '@taucad/ui/utils/cn';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useModels } from '#hooks/use-models.js';
import { useProject } from '#hooks/use-project.js';
import { useChats } from '#hooks/use-chats.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { getChatRecencyAt } from '#utils/chat-recency.utils.js';
import {
  formatReceiptTotal,
  sumReceiptCredits,
  useReceiptCredits,
} from '#routes/w.$workspace.$project/chat-message-data-usage.js';

type ChatHistoryStatusProps = {
  readonly className?: string;
};

export const ChatHistoryStatus = memo(function ({ className }: ChatHistoryStatusProps): React.JSX.Element {
  const [showCredits] = useCookie(cookieName.chatModelCost, true);
  const { resolveModel } = useModels();

  // Get active chat info
  const { editorRef, projectId } = useProject();
  const activeChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const { chats } = useChats(projectId);
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId), [chats, activeChatId]);
  const recencyAt = activeChat ? getChatRecencyAt(activeChat) : undefined;

  // Force re-render every minute to update relative time
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const refreshIntervalTimer = setInterval(forceUpdate, 60_000); // Update every minute

    return () => {
      clearInterval(refreshIntervalTimer);
    };
  }, []);

  // Read the chat-scoped active model directly from the chat row.
  // The previous implementation scanned the full message history backwards
  // to derive the "current" model from the latest stamped metadata, which
  // (a) duplicated the chat-scoped resolver's responsibility and (b) was
  // wrong while a chat existed but had not yet been used (no messages →
  // no model badge). The persisted Tau execution target is now the source
  // of truth, with a cookie fallback when the chat hasn't pinned one.
  const currentExecution = useChatSelector((state) => state.activeExecution);

  /* The chat's funded operations, as one stable string so an equal set does not
   * re-render the header on every stream emit. Credits are then read from their
   * receipts — this footer never multiplies catalog prices (B4 R2). */
  const operationKey = useChatSelector((state) => {
    const ids = new Set<string>();
    for (const message of state.messages) {
      for (const part of message.parts) {
        if (part.type === 'data-usage' && part.data.operationId !== undefined) {
          ids.add(part.data.operationId);
        }
      }
    }

    return [...ids].sort().join(' ');
  });
  const operationIds = operationKey === '' ? [] : operationKey.split(' ');
  const credits = useReceiptCredits(operationIds);
  const total = sumReceiptCredits(operationIds, credits);

  const model = useMemo(
    () => (currentExecution?.kind === 'tau' ? resolveModel(currentExecution.model) : undefined),
    [currentExecution, resolveModel],
  );

  return (
    <div
      className={cn(
        '@container',
        'sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs',
        className,
      )}
    >
      {/* Left side: Last activity */}
      <div className='flex items-center gap-3'>
        {recencyAt ? (
          <div className='flex items-center gap-1 text-muted-foreground'>
            <Clock className='size-3' />
            <span className='@[20rem]:hidden'>{formatRelativeTime(recencyAt, { short: true })}</span>
            <span className='hidden @[20rem]:inline'>{formatRelativeTime(recencyAt)}</span>
          </div>
        ) : undefined}
      </div>

      {/* Right side: Model and cost */}
      <div className='flex items-center gap-3'>
        {model ? (
          <div className='flex items-center gap-1 text-muted-foreground'>
            <SvgIcon id={model.family} className='size-3 grayscale' />
            <span className='hidden max-w-24 truncate @[20rem]:inline'>{model.name}</span>
          </div>
        ) : undefined}

        {showCredits && operationIds.length > 0 ? (
          <div
            aria-label={`Tau credits: ${formatReceiptTotal(total)}`}
            className='flex items-center gap-1 text-muted-foreground'
          >
            <Coins aria-hidden='true' className='size-3' />
            <span>{formatReceiptTotal(total)}</span>
          </div>
        ) : undefined}
      </div>
    </div>
  );
});
