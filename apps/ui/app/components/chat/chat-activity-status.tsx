import { useEffect, useState } from 'react';
import { CirclePause } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';
import { ChatActivitySpinner } from '#components/chat/chat-activity-spinner.js';
import type { ChatActivityCue } from '#utils/chat-activity-cue.js';

type ChatActivityStatusProperties = {
  readonly cue: ChatActivityCue;
  /** Request submission time in epoch milliseconds, preserved across remounts. */
  readonly startedAt?: number;
  readonly className?: string;
};

const formatElapsed = (elapsed: number): string => {
  const total = Math.max(0, Math.floor(elapsed / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : total >= 60 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

const ElapsedTime = ({ startedAt }: { readonly startedAt: number }): React.JSX.Element => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(tick);
    };
  }, []);
  return (
    <span
      role='timer'
      aria-live='off'
      aria-label='Time since message sent'
      className='shrink-0 text-muted-foreground/70 tabular-nums'
    >
      {formatElapsed(now - startedAt)}
    </span>
  );
};

/** Persistent footer presentation, also used by the design Canvas. */
export const ChatActivityStatus = ({ cue, startedAt, className }: ChatActivityStatusProperties): React.JSX.Element => (
  <div
    className={cn(
      'flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-sans text-sm font-normal text-muted-foreground',
      className,
    )}
  >
    <div className='flex max-w-full min-w-0 items-center gap-3'>
      {cue.kind === 'waiting' ? <CirclePause aria-hidden className='size-3 shrink-0' /> : <ChatActivitySpinner />}
      <span role='status' aria-label='Current activity' className='min-w-0 break-words'>
        {cue.sentence}
      </span>
    </div>
    {startedAt !== undefined && Number.isFinite(startedAt) ? (
      <ElapsedTime key={startedAt} startedAt={startedAt} />
    ) : null}
  </div>
);
