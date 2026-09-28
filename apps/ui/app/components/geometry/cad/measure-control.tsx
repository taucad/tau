import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Ruler } from 'lucide-react';
import { ToolToggle } from '#components/geometry/cad/section-view-control.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';

type MeasureControlProps = Readonly<{
  /** The formatted shortcut the tooltip shows. */
  shortcut?: string;
  /** Runs once the toggle has started measuring and its row is on screen. */
  onStart?: () => void;
}>;

/** Starts and stops measuring; stopping keeps every measurement. */
export function MeasureControl({ shortcut, onStart }: MeasureControlProps): React.JSX.Element {
  const graphicsRef = useGraphics();
  const isMeasureActive = useGraphicsSelector((state) => state.context.isMeasureActive);

  const handleToggle = useCallback(() => {
    // Synchronous, so the measuring row exists when `onStart` moves focus into it.
    flushSync(() => {
      graphicsRef.send({ type: 'setMeasureActive', payload: !isMeasureActive });
    });
    if (!isMeasureActive) {
      onStart?.();
    }
  }, [graphicsRef, isMeasureActive, onStart]);

  return (
    <ToolToggle
      tool='measure'
      name='Measure'
      label='Measure'
      icon={<Ruler className='size-4 -rotate-45' />}
      isActive={isMeasureActive}
      shortcut={shortcut}
      onToggle={handleToggle}
    />
  );
}
