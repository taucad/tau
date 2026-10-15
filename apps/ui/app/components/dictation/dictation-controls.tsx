import { memo, useCallback } from 'react';
import { Mic, Square, X } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';
import { dictationLabels } from '#components/dictation/use-dictation.js';
import type { DictationPhase, DictationWaveform } from '#components/dictation/use-dictation.js';

type DictationControls = {
  readonly phase: DictationPhase;
  readonly onStart: () => Promise<void>;
  readonly onStop: () => Promise<boolean>;
};

export const DictationButton = memo(function ({ phase, onStart, onStop }: DictationControls): React.JSX.Element {
  const recording = phase === 'recording';
  const busy = phase !== 'idle' && !recording;
  const label = recording ? 'Stop dictation' : busy ? dictationLabels[phase] : 'Dictate';
  const handleClick = useCallback(() => {
    if (busy) {
      return;
    }
    if (recording) {
      void onStop();
    } else {
      void onStart();
    }
  }, [busy, onStart, onStop, recording]);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label={label}
          aria-disabled={busy}
          aria-busy={busy}
          className={cn('shrink-0 rounded-full', phase !== 'idle' && 'bg-muted')}
          onClick={handleClick}
        >
          {busy ? (
            <Loader className='size-4' />
          ) : recording ? (
            <Square aria-hidden='true' className='size-3.5 fill-current' />
          ) : (
            <Mic aria-hidden='true' className='size-4' />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
});

export const DictationRecording = memo(function ({
  phase,
  waveform: { levels, batch },
  onCancel,
}: {
  readonly phase: DictationPhase;
  readonly waveform: DictationWaveform;
  readonly onCancel: () => void;
}): React.JSX.Element {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Cancel dictation'
            className='shrink-0 rounded-full bg-muted'
            onClick={onCancel}
          >
            <X aria-hidden='true' className='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cancel dictation</TooltipContent>
      </Tooltip>
      {phase === 'recording' ? (
        <div
          role='img'
          aria-label='Microphone waveform'
          data-slot='dictation-waveform'
          data-level={levels.at(-1) ?? 0}
          className='flex h-7 min-w-0 flex-1 items-center justify-end overflow-hidden mask-x-from-[calc(100%-var(--spacing)*4)] mask-x-to-100% text-muted-foreground/70 motion-reduce:hidden'
        >
          {/* Each batch shifts the levels one slot left, where the finished glide already shows them. Swapping
              between two identical glides restarts it in that same frame, so the row travels continuously
              instead of stepping, even through silence. */}
          <div
            className={cn(
              'flex h-full shrink-0 items-center gap-0.75',
              batch % 2 === 0 ? 'animate-dictation-scroll' : 'animate-dictation-scroll-alternate',
            )}
          >
            {levels.map((level, index) => (
              <span
                // Fixed time slots, never interactive or reordered.
                // oxlint-disable-next-line react/no-array-index-key -- Fixed waveform time slots shift levels, not DOM identity.
                key={index}
                className='max-h-6 min-h-0.75 w-0.75 shrink-0 rounded-full bg-current'
                style={{ height: `${Math.max(0, Math.min(1, level * 8)) * 100}%` }}
              />
            ))}
          </div>
        </div>
      ) : null}
      <span
        role='status'
        aria-label={dictationLabels[phase]}
        aria-busy={phase !== 'recording'}
        className={
          phase === 'recording'
            ? 'sr-only motion-reduce:not-sr-only motion-reduce:flex motion-reduce:h-7 motion-reduce:flex-1 motion-reduce:items-center motion-reduce:justify-center motion-reduce:text-sm motion-reduce:text-muted-foreground'
            : 'flex h-7 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground'
        }
      >
        <span className='truncate'>{dictationLabels[phase]}</span>
      </span>
    </>
  );
});

/** Shared preview and recoverable error feedback; neither changes the input value. */
export function DictationFeedback({
  transcript,
  error,
}: {
  readonly transcript: string;
  readonly error: string | undefined;
}): React.JSX.Element {
  return (
    <>
      {transcript === '' ? null : (
        <p data-slot='dictation-transcript' className='px-3 py-1 text-sm text-muted-foreground'>
          {transcript}
        </p>
      )}
      {error === undefined ? null : (
        <p role='alert' aria-label='Dictation error' className='px-3 py-1 text-xs text-muted-foreground'>
          {error}
        </p>
      )}
    </>
  );
}
