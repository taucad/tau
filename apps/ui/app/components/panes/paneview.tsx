import type { ComponentProps } from 'react';
import { useCallback, useImperativeHandle, useRef } from 'react';
import { PaneviewReact } from 'dockview-react';
import type { PaneviewApi, PaneviewReadyEvent } from 'dockview-react';
import { cn } from '@taucad/ui/utils/cn';
import { paneviewResizeHandle } from '#components/panes/resize-handle.js';
import { useResizeHandles } from '#components/panes/use-resize-handles.js';

/** Shared native workbench section layout with keyboard sizing and drag feedback. */
export function Paneview({
  ref,
  className,
  onReady,
  ...properties
}: ComponentProps<typeof PaneviewReact>): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<PaneviewApi | undefined>(undefined);
  useImperativeHandle(ref, () => rootRef.current!);
  useResizeHandles(rootRef, (sash) => paneviewResizeHandle(apiRef.current, sash));
  const ready = useCallback(
    (event: PaneviewReadyEvent): void => {
      apiRef.current = event.api;
      onReady(event);
    },
    [onReady],
  );
  return (
    <div className='size-full' data-resize-owner ref={rootRef}>
      <PaneviewReact {...properties} className={cn('section-resize', className)} onReady={ready} />
    </div>
  );
}
