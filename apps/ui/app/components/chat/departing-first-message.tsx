import { ChatMessageSurface } from '@taucad/chat-ui/components/chat-message-surface';
import { chatInputTextClassName } from '@taucad/chat-ui/components/chat-input-styles';
import { cn } from '@taucad/ui/utils/cn';

/**
 * A new project's first message, drawn at the place of the transcript's first row while the chat lane waits for its
 * transcript (`departFirstMessage`, WP-12 with WP-07 step 5). The same column, gutter and bubble as the row
 * (`chat-history.tsx`'s turn group and `chat-message.tsx`'s user bubble), so the row that replaces it moves nothing.
 * Decorative: the transcript's own row is the one assistive technology reads.
 *
 * @param props - The message's text and extra classes for the layer.
 * @returns The message at the first row's place.
 */
export function DepartingFirstMessage({
  text,
  className,
}: {
  readonly text: string;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <div
      aria-hidden='true'
      data-slot='departing-first-message'
      /* Session replay blocks it like the transcript it stands in for (`replay-content.lib`). */
      data-replay-content='chat'
      className={cn('pointer-events-none mt-1 overflow-hidden [scrollbar-gutter:stable]', className)}
    >
      <div className='mx-auto flex w-[calc(100%_-_1rem)] max-w-xl flex-col gap-1 py-1'>
        <div className='flex w-full flex-row items-end gap-2 space-x-reverse'>
          <div className='mx-2 flex w-full min-w-0 flex-col space-y-1'>
            {/* The transcript previews a long request collapsed to the same height. */}
            <ChatMessageSurface isUser className='max-h-60.5 overflow-hidden'>
              <div className={chatInputTextClassName}>
                {text.split('\n').map((row, index) => (
                  // oxlint-disable-next-line react/no-array-index-key -- rows of one fixed text, never reordered
                  <p key={index} className='min-h-5'>
                    {row}
                  </p>
                ))}
              </div>
            </ChatMessageSurface>
          </div>
        </div>
      </div>
    </div>
  );
}
