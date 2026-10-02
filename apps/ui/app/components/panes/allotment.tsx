import { Children, isValidElement, useImperativeHandle, useRef } from 'react';
import type { ComponentProps } from 'react';
import { Allotment as NativeAllotment } from 'allotment';
import type { AllotmentHandle } from 'allotment';
import { cn } from '@taucad/ui/utils/cn';
import { adjacentResizeViews, resizePairBounds } from '#components/panes/resize-handle.js';
import { useResizeHandles } from '#components/panes/use-resize-handles.js';

type PaneProps = ComponentProps<typeof NativeAllotment.Pane>;

type AllotmentProperties = ComponentProps<typeof NativeAllotment> & {
  readonly paneLabels: readonly string[];
};

/** Shared outer-pane resize owner. The native engine still owns dragging, reset and constraints. */
function AllotmentLayout({
  ref,
  className,
  children,
  paneLabels,
  onDragEnd,
  ...properties
}: AllotmentProperties): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AllotmentHandle>(null);
  useImperativeHandle(ref, () => apiRef.current!);
  useResizeHandles(rootRef, (sash) => {
    const views = adjacentResizeViews(sash);
    if (!views) {
      return undefined;
    }
    const panes = Children.toArray(children).filter(isValidElement<PaneProps>);
    const before = panes[views.index]?.props;
    const after = panes[views.index + 1]?.props;
    if (!before || !after || before.visible === false || after.visible === false) {
      return undefined;
    }
    const axis = views.isVertical ? 'width' : 'height';
    const value = views.before.getBoundingClientRect()[axis];
    const total = value + views.after.getBoundingClientRect()[axis];
    return {
      label: `Resize ${paneLabels[views.index]} and ${paneLabels[views.index + 1]} panes`,
      orientation: views.isVertical ? 'vertical' : 'horizontal',
      ...resizePairBounds(value, total, {
        minimum: before.minSize ?? properties.minSize ?? 30,
        maximum: before.maxSize ?? properties.maxSize ?? Number.POSITIVE_INFINITY,
        nextMinimum: after.minSize ?? properties.minSize ?? 30,
        nextMaximum: after.maxSize ?? properties.maxSize ?? Number.POSITIVE_INFINITY,
      }),
      resize(size) {
        const sizes = Array.from(
          views.before.parentElement?.children ?? [],
          (view) => view.getBoundingClientRect()[axis],
        );
        sizes[views.index] = size;
        sizes[views.index + 1] = total - size;
        apiRef.current?.resize(sizes);
        // Keyboard sizing completes immediately and must use the same persistence callback as dragging.
        onDragEnd?.(
          Array.from(views.before.parentElement?.children ?? [], (view) => view.getBoundingClientRect()[axis]),
        );
      },
    };
  });
  return (
    <div className='size-full' data-resize-owner ref={rootRef}>
      <NativeAllotment
        {...properties}
        ref={apiRef}
        className={cn('pane-resize pane-resize-allotment', className)}
        onDragEnd={onDragEnd}
      >
        {children}
      </NativeAllotment>
    </div>
  );
}

export const Allotment = Object.assign(AllotmentLayout, { Pane: NativeAllotment.Pane });
