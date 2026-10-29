import { MonitorSmartphone } from 'lucide-react';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

/** The notice's title, which is also its accessible name. @public */
export const runElsewhereTitle = 'Running on another device';

/**
 * This chat's run is in flight on another of the person's devices (cross-device chat handoff, XD3).
 *
 * A run is never moved or stopped from another device while it runs (client-host topology OQ-N21), so the notice
 * states where it is and holds the composer's send, with no action: it leaves by itself once sync brings that run's
 * ending, or once a pull of the remote shows the run went without progress long enough to count as abandoned.
 *
 * @returns The notice, or nothing while no other device runs this chat.
 * @public
 */
export function ChatRunElsewhereNotice(): React.JSX.Element | undefined {
  const { runElsewhere } = useChatComposer();
  if (runElsewhere === undefined) {
    return undefined;
  }
  return (
    <ChatErrorCard
      role='status'
      aria-label={runElsewhereTitle}
      tone='notice'
      icon={MonitorSmartphone}
      className='mb-2'
      title={runElsewhereTitle}
      description={
        runElsewhere.state === 'paused'
          ? 'This chat is waiting for an answer on another of your devices. You can send here once it finishes there.'
          : 'This chat is replying on another of your devices. You can send here once that reply finishes.'
      }
    />
  );
}
