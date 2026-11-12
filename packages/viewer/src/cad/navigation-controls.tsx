import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Move, Plus, Rotate3d } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SnapshotFrom } from 'xstate';
import { Button } from '@taucad/ui/components/button';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { FitViewControl } from '#cad/fit-view-control.jsx';
import { useViewerControlSize } from '#cad/viewer-control-size.js';
import type { CameraNavigationDirection, CameraNavigationStep } from '#graphics/three/controls/camera-navigation.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.jsx';
import type { ViewerNavigationKey, ViewerShortcutKeys } from '#hooks/use-viewer-shortcuts.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';

type GraphicsSnapshot = SnapshotFrom<typeof graphicsMachine>;

/** Whether the canvas has its controls, which a navigation step moves. */
const selectHasCameraControls = (state: GraphicsSnapshot): boolean => state.context.controlsAdapter !== undefined;

/** What the four arrow buttons do: orbit, or pan once the switch is on. */
type ArrowMode = 'orbit' | 'pan';

const arrowIcons: Readonly<Record<CameraNavigationDirection, LucideIcon>> = {
  left: ArrowLeft,
  right: ArrowRight,
  up: ArrowUp,
  down: ArrowDown,
};

const shortcutNames: Readonly<Record<`${ArrowMode}:${CameraNavigationDirection}`, ViewerNavigationKey>> = {
  'orbit:left': 'orbitLeft',
  'orbit:right': 'orbitRight',
  'orbit:up': 'orbitUp',
  'orbit:down': 'orbitDown',
  'pan:left': 'panLeft',
  'pan:right': 'panRight',
  'pan:up': 'panUp',
  'pan:down': 'panDown',
};

type StepButtonProps = Readonly<{
  label: string;
  icon: LucideIcon;
  step: CameraNavigationStep;
  shortcut?: string;
  isEnabled: boolean;
  className?: string;
}>;

/** One navigation step as a button: one click sends it to graphics. */
function StepButton({ label, icon: Icon, step, shortcut, isEnabled, className }: StepButtonProps): React.JSX.Element {
  const graphicsRef = useGraphics();
  const controlSize = useViewerControlSize();
  const navigate = (): void => {
    graphicsRef.send({ type: 'navigateCamera', step });
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size={controlSize}
          aria-label={label}
          aria-disabled={!isEnabled}
          className={className}
          onClick={isEnabled ? navigate : undefined}
        >
          <Icon className='size-4' />
        </Button>
      </TooltipTrigger>
      <TooltipContent side='left'>
        {isEnabled ? label : 'Available when the view is ready'}
        {shortcut ? (
          <KeyShortcut variant='tooltip' className='ml-1'>
            {shortcut}
          </KeyShortcut>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * What a host passes to {@link NavigationControls}.
 *
 * @public
 */
export type NavigationControlsProps = Readonly<{
  /** The formatted keys of the navigation steps, shown in the tooltips. */
  keys?: ViewerShortcutKeys['navigation'];
  /** The formatted Fit view key, shown in its tooltip. */
  fitViewShortcut?: string;
}>;

/**
 * Single-click camera controls beside the gizmo (N2, WCAG 2.5.7): orbit left, right, up and down; a switch that turns
 * those four into pan; zoom in, zoom out and Fit view. Each is a named button of at least 24 px that one click
 * operates, under every mouse preset, so orbit, pan and zoom never need a drag. Each step is a `navigateCamera` event,
 * the same one the arrow keys send; the buttons wait until the canvas has its controls.
 *
 * Inside a viewer frame (`[data-viewer-frame]`) the group sits in the frame's top-right corner, under the gizmo;
 * elsewhere it renders in place.
 *
 * @param props - The keys the tooltips show.
 * @returns The group.
 * @public
 */
export function NavigationControls({ keys, fitViewShortcut }: NavigationControlsProps): React.JSX.Element {
  const isEnabled = useGraphicsSelector(selectHasCameraControls);
  const [mode, setMode] = useState<ArrowMode>('orbit');
  const controlSize = useViewerControlSize();
  // The frame the group is placed in, found from where the host mounts it; no effect reads the DOM.
  const [frame, setFrame] = useState<HTMLElement>();
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  const findFrame = useCallback((anchor: HTMLSpanElement | null) => {
    setFrame(anchor?.closest<HTMLElement>('[data-viewer-frame]') ?? undefined);
  }, []);

  const arrow = (direction: CameraNavigationDirection, className: string): React.JSX.Element => (
    <StepButton
      label={`${mode === 'orbit' ? 'Orbit' : 'Pan'} ${direction}`}
      icon={arrowIcons[direction]}
      step={{ kind: mode, direction }}
      shortcut={keys?.[shortcutNames[`${mode}:${direction}`]]}
      isEnabled={isEnabled}
      className={className}
    />
  );
  const isPanning = mode === 'pan';
  const ModeIcon = isPanning ? Move : Rotate3d;

  const group = (
    <div
      role='group'
      aria-label='Camera'
      data-slot='viewer-navigation'
      className={
        frame === undefined
          ? 'pointer-events-auto grid w-fit grid-cols-3 gap-0.5 rounded-lg border bg-sidebar p-0.5 text-muted-foreground shadow-xs'
          : // Under the 96 px gizmo in the canvas's top-right corner, above the canvas and below the bar's menus.
            'pointer-events-auto absolute top-26 right-2 z-10 grid grid-cols-3 gap-0.5 rounded-lg border bg-sidebar p-0.5 text-muted-foreground shadow-xs'
      }
    >
      {arrow('up', 'col-start-2')}
      {arrow('left', 'col-start-1')}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size={controlSize}
            aria-label='Pan with the arrows'
            aria-pressed={isPanning}
            className={isPanning ? 'text-foreground' : undefined}
            onClick={() => {
              setMode(isPanning ? 'orbit' : 'pan');
            }}
          >
            <ModeIcon className='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='left'>
          {isPanning ? 'The arrows pan' : 'The arrows orbit'}
          {keys ? (
            <KeyShortcut variant='tooltip' className='ml-1'>
              {isPanning ? 'Shift + arrows' : 'Arrows'}
            </KeyShortcut>
          ) : null}
        </TooltipContent>
      </Tooltip>
      {arrow('right', 'col-start-3')}
      {arrow('down', 'col-start-2')}
      <StepButton
        label='Zoom in'
        icon={Plus}
        step={{ kind: 'zoom', direction: 'in' }}
        shortcut={keys?.zoomIn}
        isEnabled={isEnabled}
        className='col-start-1'
      />
      <StepButton
        label='Zoom out'
        icon={Minus}
        step={{ kind: 'zoom', direction: 'out' }}
        shortcut={keys?.zoomOut}
        isEnabled={isEnabled}
      />
      <FitViewControl shortcut={fitViewShortcut} />
    </div>
  );

  return (
    <>
      <span ref={findFrame} hidden />
      {frame === undefined ? group : createPortal(group, frame)}
    </>
  );
}
