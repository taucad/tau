import { useSelector } from '@xstate/react';
import { X } from 'lucide-react';
import type { StateFrom } from 'xstate';
import { ChatInterfaceGraphicsMeasure } from '#routes/builds_.$id/chat-interface-graphics-measure.js';
import { useBuild } from '#hooks/use-build.js';
import { ChatInterfaceGraphicsSectionView } from '#routes/builds_.$id/chat-interface-graphics-section-view.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';

const titleFromState = (state: StateFrom<typeof graphicsMachine>): string => {
  switch (true) {
    case state.matches({ operational: 'section-view' }): {
      return 'Section View';
    }
  }

  if (state.matches({ operational: 'measure' })) {
    return 'Measure';
  }

  return 'Unknown';
};

export function ChatInterfaceGraphics({ className }: { readonly className?: string }): React.ReactNode {
  const { graphicsRef: graphicsActor } = useBuild();
  const graphicsState = useSelector(graphicsActor, (state) => state);
  if (graphicsState.matches({ operational: 'ready' })) {
    return null;
  }

  const title = titleFromState(graphicsState);

  return (
    <div
      className={cn('pointer-events-auto flex h-1/2 w-80 flex-col gap-2 rounded-md border bg-sidebar p-2', className)}
    >
      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-medium">{title}</div>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-1 size-7"
          onClick={() => {
            // Reset to default: disable section view and measure, clear unpinned hovers
            if (graphicsState.context.isMeasureActive) {
              graphicsActor.send({ type: 'setMeasureActive', payload: false });
            }

            if (graphicsState.context.isSectionViewActive) {
              graphicsActor.send({ type: 'setSectionViewActive', payload: false });
            }

            graphicsActor.send({ type: 'setHoveredMeasurement', payload: undefined });
          }}
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
      <ChatInterfaceGraphicsInner />
    </div>
  );
}

function ChatInterfaceGraphicsInner(): React.JSX.Element {
  const { graphicsRef: graphicsActor } = useBuild();
  const graphicsState = useSelector(graphicsActor, (state) => state);

  switch (true) {
    case graphicsState.matches({ operational: 'section-view' }): {
      return <ChatInterfaceGraphicsSectionView />;
    }

    case graphicsState.matches({ operational: 'measure' }): {
      return <ChatInterfaceGraphicsMeasure />;
    }

    default: {
      return <div>Unknown graphics state</div>;
    }
  }
}
