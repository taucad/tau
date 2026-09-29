import { useMemo } from 'react';
import { useProjectChatUsage } from '#hooks/use-chats.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useProject } from '#hooks/use-project.js';
import { formatNumberAbbreviation } from '#utils/number.utils.js';

export function ChatDetailsUsage({ enabled = true }: { readonly enabled?: boolean } = {}):
  | React.JSX.Element
  | undefined {
  const { projectId } = useProject();
  const { chats } = useChatRecords(projectId, { enabled });
  const chatIds = useMemo(() => chats.map((chat) => chat.id), [chats]);
  const history = useProjectChatUsage(projectId, chatIds, enabled);
  const tokens = useMemo(() => {
    let total = 0;
    for (const chat of chats) {
      const summary = history.get(chat.id);
      if (summary !== undefined) {
        total += summary.inputTokens + summary.outputTokens + summary.cacheReadTokens + summary.cacheWriteTokens;
      }
    }
    return total;
  }, [chats, history]);
  return tokens === 0 ? undefined : (
    <section aria-label='Chat usage' className='rounded-xl border border-border bg-card px-3 py-2 text-sm'>
      <span className='font-medium'>Chat usage</span>
      <span className='float-right font-mono'>{formatNumberAbbreviation(tokens)} tokens</span>
    </section>
  );
}
