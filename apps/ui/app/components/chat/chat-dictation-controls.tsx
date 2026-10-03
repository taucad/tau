import { memo, useCallback } from 'react';
import { Mic, Square, X } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Loader } from '#components/ui/loader.js';
import { dictationLabels } from '#components/chat/use-dictation.js';
import type { DictationPhase } from '#components/chat/use-dictation.js';

type DictationControls = {
  readonly phase: DictationPhase;
  readonly disabled: boolean;
  readonly onStart: () => Promise<void>;
  readonly onStop: () => Promise<boolean>;
};

export const ChatDictationButton = memo(function ({
  phase,
  disabled,
  onStart,
  onStop,
}: DictationControls): React.JSX.Element {
  const recording = phase === 'recording';
  const busy = phase !== 'idle' && !recording;
  const label = recording ? 'Stop dictation' : busy ? dictationLabels[phase] : 'Dictate';
  const refusal = disabled ? 'Wait for the current message to finish' : undefined;
  const handleClick = useCallback(() => {
    if (busy || refusal !== undefined) {
      return;
    }
    if (recording) {
      void onStop();
    } else {
      void onStart();
    }
  }, [busy, onStart, onStop, recording, refusal]);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label={label}
          aria-disabled={busy || refusal !== undefined}
          className='shrink-0 rounded-full aria-disabled:opacity-50'
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
      <TooltipContent>{refusal ?? label}</TooltipContent>
    </Tooltip>
  );
});

export const ChatDictationRecording = memo(function ({
  phase,
  levels,
  onCancel,
}: {
  readonly phase: DictationPhase;
  readonly levels: readonly number[];
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
            className='shrink-0 rounded-full'
            onClick={onCancel}
          >
            <X aria-hidden='true' className='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cancel dictation</TooltipContent>
      </Tooltip>
      <div
        role='img'
        aria-label='Microphone waveform'
        data-slot='dictation-waveform'
        data-level={levels.at(-1) ?? 0}
        className='flex h-7 min-w-0 flex-1 items-center justify-end gap-0.5 overflow-hidden text-muted-foreground motion-reduce:hidden'
      >
        {levels.map((level, index) => (
          <span
            // Fixed time slots, never interactive or reordered.
            // oxlint-disable-next-line react/no-array-index-key -- Fixed waveform time slots shift levels, not DOM identity.
            key={index}
            className='h-6 w-1 shrink-0 rounded-full bg-current'
            style={{ transform: `scaleY(${Math.max(0.1, Math.min(1, level * 8))})` }}
          />
        ))}
      </div>
      <span
        role='status'
        aria-label={dictationLabels[phase]}
        aria-busy={phase !== 'recording'}
        className={
          phase === 'recording'
            ? 'sr-only motion-reduce:not-sr-only motion-reduce:text-xs motion-reduce:text-muted-foreground'
            : 'shrink-0 text-xs text-muted-foreground'
        }
      >
        {dictationLabels[phase]}
      </span>
    </>
  );
});
