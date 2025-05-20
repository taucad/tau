import { useSelector } from '@xstate/react';
import { LoaderPinwheel } from 'lucide-react';
import type { JSX } from 'react';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';

export function ChatViewerError(): JSX.Element {
  const error = useSelector(cadActor, (state) => state.context.error);
  const state = useSelector(cadActor, (state) => state.context.state);
  const shapes = useSelector(cadActor, (state) => state.context.shapes);
  return (
    <>
      {shapes.length > 0 && ['buffering', 'rendering'].includes(state) ? (
        <div className="absolute top-[90%] left-[50%] -translate-x-[50%] -translate-y-[90%]">
          <div className="border-neutral-200 m-auto flex items-center gap-2 rounded-md border bg-background/70 p-2 backdrop-blur-sm">
            <span className="font-mono text-sm text-muted-foreground capitalize">{state}...</span>
            <LoaderPinwheel className="h-6 w-6 animate-spin text-primary ease-in-out" />
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
