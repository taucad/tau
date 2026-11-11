/**
 * "We paused this model" (crash capture blueprint, the only crash UI). Shown instead of re-running a shared model
 * that stopped the page the last time it opened on this device (`#lib/kill-memory`). One component, two copy states:
 * `paused` after the first kill (primary "Try again"), `repeat` after a kill that followed "Try again" (primary
 * "Go home", secondary "Try anyway"). It sends nothing and says nothing about reporting, so it is the same in every
 * telemetry state. Laid out like the "Run this model" gate it sits beside, and no kernel or viewer runs while it shows.
 */

import { Link } from 'react-router';
import { Pause, Play } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Heading } from '@taucad/ui/components/heading';
import type { PausedState } from '#lib/kill-memory.js';

/** The gate's copy, by state. */
export const pausedModelCopy = {
  paused: {
    title: 'We paused this model',
    text: 'The page stopped the last time this model opened on this device, so we haven’t started it again. Large models often run better on a computer.',
  },
  repeat: {
    title: 'This model can’t run on this device yet',
    text: 'It stopped the page again. We’re working on making large models lighter. For now, try it on a computer.',
  },
} as const;

export function PausedModelGate({
  state,
  name,
  thumbnailUrl,
  facts,
  onRun,
}: {
  readonly state: PausedState;
  /** The model's name, the gate's label. */
  readonly name: string;
  /** The model's stored thumbnail; without one the gate shows its icon and the facts line instead. */
  readonly thumbnailUrl?: string;
  /** `<entry file> · <kernel name>`, shown only when there is no thumbnail. */
  readonly facts?: string;
  /** Run the model once. */
  readonly onRun: () => void;
}): React.JSX.Element {
  const copy = pausedModelCopy[state];
  const isRepeat = state === 'repeat';
  const run = (
    <Button type='button' variant={isRepeat ? 'outline' : 'default'} className='flex-1 sm:flex-none' onClick={onRun}>
      <Play className='size-3.5' aria-hidden />
      {isRepeat ? 'Try anyway' : 'Try again'}
    </Button>
  );
  const home = (
    <Button type='button' variant={isRepeat ? 'default' : 'outline'} className='flex-1 sm:flex-none' asChild>
      <Link to='/'>Go home</Link>
    </Button>
  );
  return (
    <main
      className='flex h-dvh items-center justify-center bg-background px-4 py-8'
      aria-labelledby='paused-model-title'
    >
      <div className='w-full max-w-md animate-in text-center duration-300 fade-in'>
        {thumbnailUrl === undefined ? (
          <div className='mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted/50 dark:bg-muted/30'>
            <Pause className='size-6 text-muted-foreground' aria-hidden />
          </div>
        ) : (
          <img src={thumbnailUrl} alt='' className='mx-auto mb-4 h-40 w-48 rounded-md object-contain' />
        )}
        <p className='text-sm font-medium text-muted-foreground'>{name}</p>
        <Heading level={1} variant='title' id='paused-model-title' className='mt-1'>
          {copy.title}
        </Heading>
        <p className='mt-2 text-sm text-muted-foreground'>{copy.text}</p>
        {thumbnailUrl === undefined && facts !== undefined ? (
          <p className='mt-3 font-mono text-xs text-muted-foreground'>{facts}</p>
        ) : null}
        <div className='mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center'>
          {isRepeat ? (
            <>
              {home}
              {run}
            </>
          ) : (
            <>
              {run}
              {home}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
