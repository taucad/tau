import { memo, useEffect, useMemo, useReducer } from 'react';
import { DollarSign, Clock } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { useChatSelector } from '#hooks/use-chat.js';
import { formatCurrency } from '#utils/currency.utils.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { cn } from '#utils/ui.utils.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useModels } from '#hooks/use-models.js';
import { useProject } from '#hooks/use-project.js';
import { useChats } from '#hooks/use-chats.js';
import { SvgIcon } from '#components/icons/svg-icon.js';

type ChatHistoryStatusProps = {
  readonly className?: string;
};

export const ChatHistoryStatus = memo(function ({ className }: ChatHistoryStatusProps): React.JSX.Element {
  const [showModelCost] = useCookie(cookieName.chatModelCost, true);
  const { resolveModel } = useModels();

  // Get active chat info
  const { editorRef, projectId } = useProject();
  const activeChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const { chats } = useChats(projectId);
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId), [chats, activeChatId]);
  const updatedAt = activeChat?.updatedAt;

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
  // no model badge). The persisted `Chat.activeModel` is now the source
  // of truth, with a cookie fallback when the chat hasn't pinned one.
  const currentModel = useChatSelector((state) => state.activeModel);

  // Calculate total cost from all usage data parts
  const totalCost = useChatSelector((state) => {
    let cost = 0;
    for (const message of state.messages) {
      for (const part of message.parts) {
        if (part.type === 'data-usage') {
          cost += part.data.totalCost;
        }
      }
    }

    return cost;
  });

  const model = useMemo(() => (currentModel ? resolveModel(currentModel) : undefined), [currentModel, resolveModel]);

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
        {updatedAt ? (
          <div className='flex items-center gap-1 text-muted-foreground'>
            <Clock className='size-3' />
            <span className='@[20rem]:hidden'>{formatRelativeTime(updatedAt, { short: true })}</span>
            <span className='hidden @[20rem]:inline'>{formatRelativeTime(updatedAt)}</span>
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

        {showModelCost && totalCost > 0 ? (
          <div className='flex items-center gap-0.5 text-muted-foreground'>
            <DollarSign className='size-3' />
            <span>{formatCurrency(totalCost, { significantFigures: 2 })}</span>
          </div>
        ) : undefined}
      </div>
    </div>
  );
});
