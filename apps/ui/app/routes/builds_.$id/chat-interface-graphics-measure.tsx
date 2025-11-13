import { useMemo } from 'react';
import type { StateFrom } from 'xstate';
import { Pin, PinOff, Trash } from 'lucide-react';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { useBuild } from '#hooks/use-build.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';

type GraphicsState = StateFrom<typeof graphicsMachine>;

type Properties = {
  readonly state: GraphicsState;
};

export function ChatInterfaceGraphicsMeasure({ state }: Properties): React.JSX.Element {
  const { graphicsRef: graphicsActor } = useBuild();
  const { measurements, gridUnit, gridUnitFactor, hoveredMeasurementId } = state.context as unknown as {
    measurements: Array<{ id: string; distance: number; name?: string; isPinned?: boolean }>;
    gridUnit: string;
    gridUnitFactor: number;
    hoveredMeasurementId?: string;
  };

  const sorted = useMemo(() => {
    // Pinned first, then newest first (by id timestamp suffix)
    return [...measurements].sort((a, b) => {
      const pinDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
      if (pinDiff !== 0) {
        return pinDiff;
      }

      const ta = Number(a.id.split('measurement-')[1] ?? 0);
      const tb = Number(b.id.split('measurement-')[1] ?? 0);
      return tb - ta;
    });
  }, [measurements]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <div>Measurements</div>
        <div className="text-[11px]">Hover to preview, pin to persist</div>
      </div>
      <div className="mt-1 grid gap-1">
        {sorted.length === 0 ? <EmptyItems className="mx-1 -mt-1">No measurements</EmptyItems> : null}

        {sorted.map((m) => {
          const value = (m.distance / gridUnitFactor).toFixed(1);
          const label = m.name?.trim() ? m.name : `${value} ${gridUnit}`;
          const isExternallyHovered = hoveredMeasurementId === m.id;
          return (
            <div
              key={m.id}
              className={`group flex items-center gap-2 rounded-md border bg-card px-1 py-1 ${
                isExternallyHovered ? 'bg-accent/20 ring-1 ring-primary/30' : ''
              }`}
              onMouseEnter={() => {
                graphicsActor.send({ type: 'setHoveredMeasurement', payload: m.id });
              }}
              onMouseLeave={() => {
                graphicsActor.send({ type: 'setHoveredMeasurement', payload: undefined });
              }}
            >
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-7', m.isPinned ? 'text-primary' : 'text-muted-foreground')}
                title={m.isPinned ? 'Unpin' : 'Pin'}
                onClick={() => {
                  graphicsActor.send({ type: 'toggleMeasurementPinned', id: m.id });
                }}
              >
                {m.isPinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
              </Button>

              <div className="min-w-0 flex-1 truncate text-sm">{label}</div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    graphicsActor.send({ type: 'clearMeasurement', payload: m.id });
                  }}
                >
                  <Trash className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
