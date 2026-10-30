import { memo, useCallback, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { Mic, Square, X } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';
import { dictationLabels } from '#components/dictation/use-dictation.js';
import type { DictationPhase, DictationWaveform } from '#components/dictation/use-dictation.js';

/** The composer's 28px pill (as `ghostPillClass`), so the expanded microphone lines up with Send. */
const stopPillClass = 'h-7 rounded-full px-2.5 text-muted-foreground hover:text-foreground';

type DictationControlProperties = {
  readonly phase: DictationPhase;
  readonly waveform: DictationWaveform;
  readonly onStart: () => Promise<void>;
  readonly onStop: () => Promise<boolean>;
  readonly onCancel: () => void;
  /** Whether dictation is offered is still being asked: the microphone holds its place and does nothing yet. */
  readonly isPending?: boolean;
};

/**
 * The one dictation control every input shares. At rest it is the microphone; once started it expands in place
 * into an outlined pill holding the live waveform and a stop square, the whole pill stopping the recording, with
 * a cancel button on its left. The input and its other controls stay where they are.
 */
export const DictationControl = memo(function ({
  phase,
  waveform,
  onStart,
  onStop,
  onCancel,
  isPending = false,
}: DictationControlProperties): React.JSX.Element {
  const active = phase !== 'idle';
  const microphoneRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  /* Pressing the microphone, cancel or the pill unmounts the pressed button; carry focus to its counterpart
   * instead of dropping it to the page. Send, Escape or the input's own focus keep it where they put it. */
  const carryFocus = useRef(false);
  const pressed = useCallback(() => {
    carryFocus.current = true;
  }, []);
  useLayoutEffect(() => {
    if (!carryFocus.current) {
      return;
    }
    carryFocus.current = false;
    if (document.activeElement === null || document.activeElement === document.body) {
      (active ? stopRef : microphoneRef).current?.focus();
    }
  }, [active]);
  if (!active) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={microphoneRef}
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={dictationLabels.idle}
            aria-disabled={isPending}
            className='shrink-0 rounded-full'
            onClick={() => {
              if (isPending) {
                return;
              }
              pressed();
              void onStart();
            }}
          >
            <Mic aria-hidden='true' className='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{dictationLabels.idle}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <div
      data-slot='dictation-control'
      className='flex shrink-0 animate-in items-center gap-1 duration-200 ease-out fade-in motion-reduce:animate-none'
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Cancel dictation'
            className='shrink-0 rounded-full text-muted-foreground'
            onClick={() => {
              pressed();
              onCancel();
            }}
          >
            <X aria-hidden='true' className='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cancel dictation</TooltipContent>
      </Tooltip>
      <DictationStopPill
        buttonRef={stopRef}
        phase={phase}
        waveform={waveform}
        onStop={async () => {
          pressed();
          return onStop();
        }}
      />
    </div>
  );
});

/** The expanded microphone: an outlined pill whose whole face stops recording. */
function DictationStopPill({
  buttonRef,
  phase,
  waveform: { levels, batch },
  onStop,
}: Pick<DictationControlProperties, 'phase' | 'waveform' | 'onStop'> & {
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  const recording = phase === 'recording';
  const label = recording ? 'Stop dictation' : dictationLabels[phase];
  const handleClick = useCallback(() => {
    if (recording) {
      void onStop();
    }
  }, [onStop, recording]);
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={buttonRef}
            type='button'
            variant='outline'
            size='sm'
            aria-label={label}
            aria-disabled={!recording}
            aria-busy={!recording}
            className={cn(
              stopPillClass,
              'shrink-0 origin-right shadow-none',
              // The microphone grows into the pill from its own corner: transform and opacity only.
              'animate-in duration-200 ease-out fade-in zoom-in-50 motion-reduce:animate-none',
            )}
            onClick={handleClick}
          >
            {recording ? (
              <>
                <span
                  role='img'
                  aria-label='Microphone waveform'
                  data-slot='dictation-waveform'
                  data-level={levels.at(-1) ?? 0}
                  className='flex h-4 w-12 items-center justify-end overflow-hidden mask-l-from-[calc(100%-var(--spacing)*3)] mask-l-to-100% text-muted-foreground motion-reduce:invisible'
                >
                  {/* Each batch shifts the levels one slot left, where the finished glide already shows them. Swapping
                    between two identical glides restarts it in that same frame, so the row travels continuously
                    instead of stepping, even through silence. */}
                  <span
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
                        className='min-h-0.75 w-0.75 shrink-0 rounded-full bg-current'
                        style={{
                          height: `${Math.max(0, Math.min(1, level * 8)) * 100}%`,
                        }}
                      />
                    ))}
                  </span>
                </span>
                <Square aria-hidden='true' className='size-3 shrink-0 fill-current' />
              </>
            ) : (
              // Same width as the waveform and stop square, so the pill holds its size while it works.
              <span className='flex w-16.5 justify-center'>
                <Loader className='size-3.5' />
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <span role='status' aria-label={dictationLabels[phase]} aria-busy={!recording} className='sr-only'>
        {dictationLabels[phase]}
      </span>
    </>
  );
}

/** The streamed transcript preview while transcribing; it never changes the input value. Failures show as toasts. */
export function DictationFeedback({ transcript }: { readonly transcript: string }): React.JSX.Element | undefined {
  return transcript === '' ? undefined : (
    <p data-slot='dictation-transcript' className='px-3 py-1 text-sm text-muted-foreground'>
      {transcript}
    </p>
  );
}
