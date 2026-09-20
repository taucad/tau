import { useMemo } from 'react';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';
import { formatNumberAbbreviation } from '#utils/number.utils.js';

export function ChatDetailsUsage(): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const { chats } = useChats(projectId);
  const tokens = useMemo(() => {
    let total = 0;
    for (const chat of chats) {
      for (const message of chat.messages) {
        for (const part of message.parts) {
          if (part.type === 'data-usage') {
            total +=
              part.data.inputTokens + part.data.outputTokens + part.data.cacheReadTokens + part.data.cacheWriteTokens;
          }
        }
      }
    }
    return total;
  }, [chats]);
  return tokens === 0 ? undefined : (
    <section aria-label='Chat usage' className='rounded-xl border border-border bg-card px-3 py-2 text-sm'>
      <span className='font-medium'>Chat usage</span>
      <span className='float-right font-mono'>{formatNumberAbbreviation(tokens)} tokens</span>
    </section>
  );
}
