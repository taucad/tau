import { GripVertical } from 'lucide-react';
import * as ResizablePrimitive from 'react-resizable-panels';
import type { SetRequired } from 'type-fest';
import { cn } from '#utils/ui.js';
import { cva } from 'class-variance-authority';

function ResizablePanelGroup({
  className,
  ...properties
}: SetRequired<
  React.ComponentProps<typeof ResizablePrimitive.PanelGroup>,
  // Required to ensure layout is persisted to cookies for best UX.
  'autoSaveId'
>): React.JSX.Element {
  return (
    <ResizablePrimitive.PanelGroup
      className={cn('flex size-full data-[panel-group-direction=vertical]:flex-col', className)}
      {...properties}
    />
  );
}

const ResizablePanel = ResizablePrimitive.Panel;

const resizableHandleVariants = cva(
  cn(
    'relative flex w-0 items-center justify-center bg-border',
    'after:absolute after:inset-y-0 after:left-1/2 after:z-10 after:w-[1px] after:-translate-x-1/2 after:bg-border after:transition-[width,height] after:duration-200 after:ease-in-out data-[resize-handle-state=drag]:after:transition-all data-[resize-handle-state=hover]:after:transition-all',
    'data-[resize-handle-state=drag]:after:w-[3px] data-[resize-handle-state=hover]:after:w-[3px]',
    'data-[resize-handle-state=drag]:after:bg-neutral/50',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none',
    // Vertical specific styles
    'data-[panel-group-direction=vertical]:h-0 data-[panel-group-direction=vertical]:w-full',
    'data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-[1px] data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0',
    'data-[panel-group-direction=vertical]:data-[resize-handle-state=drag]:after:h-[3px] data-[panel-group-direction=vertical]:data-[resize-handle-state=drag]:after:w-full data-[panel-group-direction=vertical]:data-[resize-handle-state=hover]:after:h-[3px] data-[panel-group-direction=vertical]:data-[resize-handle-state=hover]:after:w-full',
    '[&[data-panel-group-direction=vertical]>div]:rotate-90',
  ),
  {
    variants: {
      variant: {
        default: '',
        floating: 'my-4 -mx-1.5 w-3 bg-transparent after:opacity-0 after:rounded-full pointer-events-auto',
      },
      defaultVariants: {
        variant: 'default',
      },
    }
  }
)

function ResizableHandle({
  hasHandle,
  className,
  variant,
  ...properties
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  readonly hasHandle?: boolean;
  readonly variant?: 'default' | 'floating';
}): React.JSX.Element {
  return (
    <ResizablePrimitive.PanelResizeHandle
      className={cn(resizableHandleVariants({ variant, className }))}
      {...properties}
    >
      {hasHandle ? (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
          <GripVertical className="h-2.5 w-2.5" />
        </div>
      ) : null}
    </ResizablePrimitive.PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
