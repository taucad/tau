import { useSelector } from '@xstate/react';
import { LoaderPinwheel } from 'lucide-react';
import type { JSX } from 'react';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';

export function ChatViewerStatus(): JSX.Element {
  const error = useSelector(cadActor, (state) => state.context.kernelError);
  const state = useSelector(cadActor, (state) => state.value);
  return (
    <>
      {['buffering', 'rendering', 'booting', 'initializing'].includes(state) ? (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:top-[90%] md:left-[50%] md:-translate-x-[50%] md:-translate-y-[90%]">
          <div className="border-neutral-200 m-auto flex items-center gap-2 rounded-md border bg-background/70 p-1 backdrop-blur-sm md:p-2">
            <span className="font-mono text-sm text-muted-foreground capitalize">{state}...</span>
            <LoaderPinwheel className="size-4 animate-spin text-primary ease-in-out md:size-6" />
          </div>
        </div>
      ) : null}
      <div className="absolute bottom-12 left-2">
        {error ? (
          <div className="rounded-md bg-destructive/10 px-3 py-0.5 text-xs text-destructive">{error}</div>
        ) : null}
      </div>
    </>
  );
}
