import { useSelector } from '@xstate/react';
import { X } from 'lucide-react';
import type { StateFrom } from 'xstate';
import { ChatInterfaceGraphicsMeasure } from '#routes/builds_.$id/chat-interface-graphics-measure.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { ChatInterfaceGraphicsSectionView } from '#routes/builds_.$id/chat-interface-graphics-section-view.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';

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

export function ChatInterfaceGraphics(): React.ReactNode {
  const graphicsState = useSelector(graphicsActor, (state) => state);
  if (graphicsState.matches({ operational: 'ready' })) {
    return null;
  }

  const title = titleFromState(graphicsState);

  return (
    <div className="pointer-events-auto flex h-1/2 w-80 flex-col gap-2 rounded-md border bg-sidebar p-2">
      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          title="Close"
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
        </button>
      </div>
      <ChatInterfaceGraphicsInner />
    </div>
  );
}

function ChatInterfaceGraphicsInner(): React.JSX.Element {
  const graphicsState = useSelector(graphicsActor, (state) => state);

  switch (true) {
    case graphicsState.matches({ operational: 'section-view' }): {
      return <ChatInterfaceGraphicsSectionView />;
    }

    case graphicsState.matches({ operational: 'measure' }): {
      return <ChatInterfaceGraphicsMeasure state={graphicsState} />;
    }

    default: {
      return <div>Unknown graphics state</div>;
    }
  }
}
