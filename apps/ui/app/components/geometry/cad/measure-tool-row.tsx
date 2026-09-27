import { useRef } from 'react';
import { flushSync } from 'react-dom';
import { ChevronUp, Pin, PinOff, Trash } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { AxisLabel, focusFirstControl } from '#components/geometry/cad/section-tool-row.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';

const deltaAxes = [
  ['x', 0],
  ['y', 1],
  ['z', 2],
] as const;

/**
 * The measurements, pinned first and then newest first. Hovering or focusing a row previews it in the scene; each
 * row pins or removes its measurement.
 */
function MeasurementList({ onEmptied }: Readonly<{ onEmptied: () => void }>): React.JSX.Element {
  const graphicsRef = useGraphics();
  const measurements = useGraphicsSelector((state) => state.context.measurements);
  const hoveredId = useGraphicsSelector((state) => state.context.hoveredMeasurementId);
  const metersPerUnit = useGraphicsSelector((state) => state.context.displayUnits.length.metersPerUnit);
  const symbol = useGraphicsSelector((state) => state.context.displayUnits.length.symbol);
  const sorted = measurements
    .toReversed()
    .toSorted((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)));

  const hover = (id: string | undefined): void => {
    graphicsRef.send({ type: 'setHoveredMeasurement', payload: id });
  };

  const remove = (id: string, event: React.MouseEvent<HTMLButtonElement>): void => {
    const row = event.currentTarget.closest('li');
    const neighbour = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector<HTMLElement>(
      '[data-measurement-remove]',
    );
    flushSync(() => {
      graphicsRef.send({ type: 'clearMeasurement', payload: id });
    });
    if (neighbour) {
      neighbour.focus();
    } else {
      onEmptied();
    }
  };

  return (
    <ul aria-label='Measurements' className='grid gap-1'>
      {sorted.map((measurement) => {
        const value = (measurement.distance / metersPerUnit).toFixed(1);
        const label = measurement.name?.trim() ? measurement.name : `${value} ${symbol}`;
        return (
          <li
            key={measurement.id}
            data-hovered={hoveredId === measurement.id}
            className='grid rounded-md p-1 data-[hovered=true]:bg-accent'
            onPointerEnter={() => {
              hover(measurement.id);
            }}
            onPointerLeave={() => {
              hover(undefined);
            }}
            // Keyboard focus previews the measurement as hover does; the focus a pointer-opened list lands with does not.
            onFocus={(event) => {
              if (event.target.matches(':focus-visible')) {
                hover(measurement.id);
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                hover(undefined);
              }
            }}
          >
            <div className='flex items-center gap-1'>
              <Button
                variant='ghost'
                size='icon-xs'
                aria-label={`Pin ${label}`}
                aria-pressed={Boolean(measurement.isPinned)}
                className={measurement.isPinned ? 'text-foreground' : 'text-muted-foreground'}
                onClick={() => {
                  graphicsRef.send({ type: 'toggleMeasurementPinned', id: measurement.id });
                }}
              >
                {measurement.isPinned ? <Pin /> : <PinOff />}
              </Button>
              <span className='min-w-0 flex-1 truncate text-sm tabular-nums'>{label}</span>
              <Button
                variant='ghost'
                size='icon-xs'
                aria-label={`Remove ${label}`}
                data-measurement-remove=''
                className='text-muted-foreground hover:text-destructive'
                onClick={(event) => {
                  remove(measurement.id, event);
                }}
              >
                <Trash />
              </Button>
            </div>
            <div className='flex items-center gap-2 pl-7 text-xs text-muted-foreground tabular-nums'>
              {deltaAxes.map(([axis, index]) => (
                <span key={axis}>
                  <AxisLabel axis={axis} />{' '}
                  {Math.abs((measurement.endPoint[index] - measurement.startPoint[index]) / metersPerUnit).toFixed(1)}
                </span>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const countLabelOf = (count: number): string =>
  count === 0 ? 'Click two points' : `${count} ${count === 1 ? 'measurement' : 'measurements'}`;

/**
 * The Measuring row's options: the count, which opens the list of measurements, and Clear all. A polite live region
 * announces the count as it changes.
 */
export function MeasureOptions(): React.JSX.Element {
  const graphicsRef = useGraphics();
  const count = useGraphicsSelector((state) => state.context.measurements.length);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const countLabel = countLabelOf(count);

  // With nothing left to list or clear, the row's next control is Done.
  const focusRow = (): void => {
    focusFirstControl(anchorRef.current?.closest('[data-tool-bar]') ?? undefined);
  };

  return (
    <>
      <span ref={anchorRef} role='status' className='sr-only'>
        {countLabel}
      </span>
      {count === 0 ? (
        <span aria-hidden='true' className='px-1 text-xs text-muted-foreground'>
          {countLabel}
        </span>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant='ghost' size='xs' className='h-7 gap-1 tabular-nums'>
              {countLabel}
              <ChevronUp className='size-3 text-muted-foreground' />
            </Button>
          </PopoverTrigger>
          <PopoverContent side='top' align='start' className='w-72 p-1'>
            <MeasurementList onEmptied={focusRow} />
          </PopoverContent>
        </Popover>
      )}
      <Button
        variant='ghost'
        size='xs'
        className='h-7'
        disabled={count === 0}
        onClick={() => {
          flushSync(() => {
            graphicsRef.send({ type: 'clearAllMeasurements' });
          });
          focusRow();
        }}
      >
        Clear all
      </Button>
    </>
  );
}
