import { useEffect, useMemo, useReducer } from 'react';
import { useSelector } from '@xstate/react';
import { DropdownMenuLabel, DropdownMenuSeparator } from '@taucad/ui/components/dropdown-menu';
import { useChatSelector } from '#hooks/use-chat.js';
import { formatRelativeTime } from '#utils/date.utils.js';
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
import { tauCloudEnabled } from '#cloud/cloud-enabled.js';

const none = '—';

/**
 * The chat's activity, model and credits as a read-only block at the end of
 * the chat menu. This used to be the pane's status row; in the menu it costs
 * the name nothing and only subscribes while the menu is open.
 */
export function ChatOptionsMeta(): React.JSX.Element {
  const [showCredits] = useCookie(cookieName.chatModelCost, true);
  const { resolveModel } = useModels();
  const { editorRef, projectId } = useProject();
  const activeChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const { chats } = useChats(projectId);
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId), [chats, activeChatId]);
  const recencyAt = activeChat ? getChatRecencyAt(activeChat) : undefined;

  // Relative time drifts while the menu stays open; refresh it once a minute.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const refreshIntervalTimer = setInterval(forceUpdate, 60_000);
    return () => {
      clearInterval(refreshIntervalTimer);
    };
  }, []);

  // The persisted execution target is the source of truth for the model; a
  // chat that has not been used yet still has one.
  const currentExecution = useChatSelector((state) => state.activeExecution);

  /* The chat's funded operations as one stable string, so an equal set does not
   * re-render on every stream emit; credits then come from their receipts, never
   * from locally multiplied catalog prices (B4 R2). */
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
  const hasCredits = tauCloudEnabled && showCredits && operationIds.length > 0;

  const model = useMemo(
    () => (currentExecution?.kind === 'tau' ? resolveModel(currentExecution.model) : undefined),
    [currentExecution, resolveModel],
  );

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className='font-normal'>
        <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground'>
          <dt>Activity</dt>
          <dd className='truncate text-foreground'>{recencyAt ? formatRelativeTime(recencyAt) : none}</dd>
          <dt>Runs on</dt>
          <dd className='flex min-w-0 items-center gap-1 text-foreground'>
            {model ? (
              <>
                <SvgIcon id={model.family} className='size-3 shrink-0 grayscale' />
                <span className='truncate'>{model.name}</span>
              </>
            ) : (
              none
            )}
          </dd>
          <dt>Credits</dt>
          <dd
            className='text-foreground'
            aria-label={hasCredits ? `Tau credits: ${formatReceiptTotal(total)}` : undefined}
          >
            {hasCredits ? formatReceiptTotal(total) : none}
          </dd>
        </dl>
      </DropdownMenuLabel>
    </>
  );
}
