import { useViewerControlSize } from '#cad/viewer-control-size.js';
import React, { useCallback, useRef, useState, useMemo } from 'react';
import type { ClassValue } from 'clsx';
import { Aperture, Axis3D, Box, Grid3X3, Rotate3D, Settings, Spline, Sparkles, ArrowUp, Timer } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuToggleGroupItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { cn } from '@taucad/ui/utils/cn';
import { AxisLabel } from '#cad/section-tool-row.jsx';
import { InfoTooltip } from '@taucad/ui/components/info-tooltip';
import {
  DropdownMenuSelectItem,
  DropdownMenuSliderItem,
  preventMenuSliderEscapeDismissal,
} from '@taucad/ui/components/menu-slider-item';
import { useCameraRig, useCameraSelector, useGraphics, useGraphicsSelector } from '#hooks/use-graphics.jsx';
import { clamp } from '@taucad/ui/utils/number';
import { useViewerViewFields } from '#cad/viewer-view-fields.jsx';
import type { ViewerViewFieldPath } from '#cad/viewer-view-fields.jsx';

// Up direction options
type UpDirection = 'x' | 'y' | 'z';

type TimeoutOption = {
  /** Render timeout. Milliseconds. */
  value: number;
  label: string;
};

const timeoutOptions: TimeoutOption[] = [
  { value: 0, label: 'Disabled' },
  { value: 15_000, label: '15s' },
  { value: 30_000, label: '30s' },
  { value: 60_000, label: '1 min' },
  { value: 180_000, label: '3 min' },
  { value: 300_000, label: '5 min' },
  { value: 600_000, label: '10 min' },
];

const upDirectionOptions: Array<{
  value: UpDirection;
  label: React.ReactNode;
  ariaLabel: string;
}> = [
  { value: 'x', label: <AxisLabel axis='x' />, ariaLabel: 'X-up' },
  { value: 'y', label: <AxisLabel axis='y' />, ariaLabel: 'Y-up' },
  { value: 'z', label: <AxisLabel axis='z' />, ariaLabel: 'Z-up' },
];

/** The widest field of view in degrees; 0° is orthographic. */
const maxVerticalFieldOfView = 90;
/** Degrees per arrow-key step while Shift is held. */
const shiftVerticalFieldOfViewStep = 5;

type DropdownMenuContentProps = React.ComponentProps<typeof DropdownMenuContent>;

type ViewerSettingsProps = {
  /**
   * Optional className for styling
   */
  readonly className?: ClassValue;
  /** The side of the trigger the menu opens on. A centred bar opens it upward. */
  readonly side?: DropdownMenuContentProps['side'];
  /** How the menu aligns against the trigger. */
  readonly align?: DropdownMenuContentProps['align'];
  /** The current view's kernel settings, closing the Rendering section; the viewer supplies them per pane. */
  readonly kernelSettings?: React.ReactNode;
  /** The CAD operation timeout row; absent when the embedder runs no CAD operations. */
  readonly operationTimeout?: ViewerOperationTimeout;
};

/**
 * The CAD operation timeout the settings menu edits. All values are milliseconds; 0 disables the timeout.
 *
 * @public
 */
export type ViewerOperationTimeout = Readonly<{
  /** The current timeout. */
  value: number;
  /** The option shown when `value` matches none of the menu's options. */
  defaultValue: number;
  /** Called with the chosen timeout. */
  onChange: (operationTimeout: number) => void;
}>;

/**
 * A tooltip trigger around a menu slider row. The row stops pointer events from bubbling, so Radix's pointer
 * handlers run in the capture phase, where the row cannot stop them.
 */
function SliderRowTrigger({
  onPointerMove,
  onPointerDown,
  ...properties
}: React.ComponentProps<'div'>): React.JSX.Element {
  return <div {...properties} onPointerMoveCapture={onPointerMove} onPointerDownCapture={onPointerDown} />;
}

/**
 * The field of view, 0–90° where 0° is orthographic. The row owns its camera subscription, so a scrub re-renders
 * only this row.
 */
function FieldOfViewRow(): React.JSX.Element {
  const cameraRig = useCameraRig();
  const viewFields = useViewerViewFields();
  const fieldOfView = useCameraSelector((state) => state.context.view.requestedVerticalFieldOfView);

  // The camera throws on an angle outside its range, so typed values are clamped as well as stepped ones.
  const setFieldOfView = useCallback(
    (value: number) => {
      const verticalFieldOfView = clamp(Math.round(value), 0, maxVerticalFieldOfView);
      if (viewFields) {
        void viewFields.set('fieldOfView', verticalFieldOfView);
        return;
      }
      cameraRig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView });
    },
    [cameraRig, viewFields],
  );

  const stepFieldOfView = useCallback(
    (direction: -1 | 1, { shift }: { shift: boolean }) => {
      setFieldOfView(fieldOfView + direction * (shift ? shiftVerticalFieldOfViewStep : 1));
    },
    [fieldOfView, setFieldOfView],
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SliderRowTrigger>
          <DropdownMenuSliderItem
            value={fieldOfView}
            min={0}
            max={maxVerticalFieldOfView}
            step={1}
            trailingAdornment='°'
            aria-label='Field of view, 0° is orthographic'
            onValueChange={setFieldOfView}
            onStep={stepFieldOfView}
          >
            <Aperture />
            {fieldOfView === 0 ? 'Orthographic' : 'Field of view'}
          </DropdownMenuSliderItem>
        </SliderRowTrigger>
      </TooltipTrigger>
      <TooltipContent side='right' sideOffset={12}>
        Drag for field of view · 0° is orthographic
        <br />
        <span className='text-xs opacity-70'>
          Click or Enter to type · ←→ step 1° · Shift 5° · P toggles orthographic
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Component that provides camera and visibility settings for the 3D viewer.
 * All settings are per-view, read from the per-view GraphicsMachine state via GraphicsProvider;
 * the embedder supplies the CAD operation timeout.
 * @public
 */
export function ViewerSettings({
  className,
  side = 'right',
  align = 'end',
  kernelSettings,
  operationTimeout,
}: ViewerSettingsProps): React.ReactNode {
  const graphicsRef = useGraphics();

  const [isOpen, setIsOpen] = useState(false);
  // A press outside leaves focus with the pointer; a keyboard close returns it to the trigger.
  const isClosingFromPointerRef = useRef(false);

  // Read all settings from per-view graphicsMachine state via context
  const enableSurfaces = useGraphicsSelector((state) => state.context.enableSurfaces);
  const enableLines = useGraphicsSelector((state) => state.context.enableLines);
  const enableGizmo = useGraphicsSelector((state) => state.context.enableGizmo);
  const enableGrid = useGraphicsSelector((state) => state.context.enableGrid);
  const enableAxes = useGraphicsSelector((state) => state.context.enableAxes);
  const enableMatcap = useGraphicsSelector((state) => state.context.enableMatcap);
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);
  const is2dGeometry = useGraphicsSelector((state) => state.context.artifact?.mimeType === 'image/svg+xml');

  const viewFields = useViewerViewFields();
  /* With the host's view commands each control sets its leaf in the view; without them it changes the live owner. */
  const handlers = useMemo(() => {
    const toggle =
      (
        leaf: Extract<ViewerViewFieldPath, `display.${string}`>,
        type:
          | 'setSurfaceVisibility'
          | 'setLinesVisibility'
          | 'setGizmoVisibility'
          | 'setGridVisibility'
          | 'setAxesVisibility'
          | 'setMatcapVisibility',
      ) =>
      (checked: boolean): void => {
        if (viewFields) {
          void viewFields.set(leaf, checked);
          return;
        }
        graphicsRef.send({ type, payload: checked });
      };
    return {
      surfaces: toggle('display.surfaces', 'setSurfaceVisibility'),
      lines: toggle('display.lines', 'setLinesVisibility'),
      gizmo: toggle('display.gizmo', 'setGizmoVisibility'),
      grid: toggle('display.grid', 'setGridVisibility'),
      axes: toggle('display.axes', 'setAxesVisibility'),
      matcap: toggle('display.matcap', 'setMatcapVisibility'),
      upDirection: (value: UpDirection): void => {
        if (viewFields) {
          void viewFields.set('upDirection', value);
          return;
        }
        graphicsRef.send({ type: 'setUpDirection', payload: value });
      },
    };
  }, [graphicsRef, viewFields]);

  const onOperationTimeoutChange = operationTimeout?.onChange;
  const handleOperationTimeoutChange = useCallback(
    (value: string) => {
      onOperationTimeoutChange?.(Number(value));
    },
    [onOperationTimeoutChange],
  );

  const controlSize = useViewerControlSize();
  const operationTimeoutValue = operationTimeout?.value;
  const operationTimeoutDefault = operationTimeout?.defaultValue;
  const currentTimeoutOption = useMemo(
    () =>
      timeoutOptions.find((option) => option.value === operationTimeoutValue) ??
      timeoutOptions.find((option) => option.value === operationTimeoutDefault) ??
      timeoutOptions[0]!,
    [operationTimeoutDefault, operationTimeoutValue],
  );

  const getTimeoutValue = useCallback((option: TimeoutOption): string => String(option.value), []);
  const getTimeoutLabel = useCallback((option: TimeoutOption): string => option.label, []);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant='overlay' size={controlSize} aria-label='Viewer settings' className={cn(className)}>
              <Settings />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side='top'>Viewer settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align={align}
        side={side}
        className='w-72'
        onEscapeKeyDown={preventMenuSliderEscapeDismissal}
        onPointerDownOutside={() => {
          isClosingFromPointerRef.current = true;
        }}
        onCloseAutoFocus={(event) => {
          if (isClosingFromPointerRef.current) {
            event.preventDefault();
          }
          isClosingFromPointerRef.current = false;
        }}
      >
        {!is2dGeometry && (
          <>
            <DropdownMenuLabel>Model</DropdownMenuLabel>
            <DropdownMenuSwitchItem isChecked={enableSurfaces} onIsCheckedChange={handlers.surfaces}>
              <Box />
              Surfaces
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem isChecked={enableLines} onIsCheckedChange={handlers.lines}>
              <Spline />
              Edges
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem
              icon={<Sparkles />}
              description={`Lighting effects are ${enableMatcap ? 'inactive' : 'active'}`}
              isChecked={enableMatcap}
              onIsCheckedChange={handlers.matcap}
            >
              Matcap{' '}
              <InfoTooltip>
                A material that gives models a consistent appearance independent of scene lighting.
                <br /> Rendering performance is improved with this enabled.
              </InfoTooltip>
            </DropdownMenuSwitchItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>Viewport</DropdownMenuLabel>
        <DropdownMenuSwitchItem
          className={cn(is2dGeometry && 'hidden')}
          isChecked={enableGizmo}
          onIsCheckedChange={handlers.gizmo}
        >
          <Rotate3D />
          Gizmo
        </DropdownMenuSwitchItem>
        <DropdownMenuSwitchItem isChecked={enableGrid} onIsCheckedChange={handlers.grid}>
          <Grid3X3 />
          Grid
        </DropdownMenuSwitchItem>
        <DropdownMenuSwitchItem isChecked={enableAxes} onIsCheckedChange={handlers.axes}>
          <Axis3D />
          Axes
        </DropdownMenuSwitchItem>
        {!is2dGeometry && (
          <>
            <DropdownMenuToggleGroupItem
              value={upDirection}
              options={upDirectionOptions}
              onValueChange={handlers.upDirection}
            >
              <ArrowUp />
              Up Direction
            </DropdownMenuToggleGroupItem>
            <FieldOfViewRow />
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Rendering</DropdownMenuLabel>
        {operationTimeout ? (
          <DropdownMenuSelectItem
            value={currentTimeoutOption}
            options={timeoutOptions}
            getOptionValue={getTimeoutValue}
            getOptionLabel={getTimeoutLabel}
            infoTooltip={
              <InfoTooltip>
                Maximum time to wait for CAD rendering before timing out.
                <br /> Set to &quot;Disabled&quot; to turn off timeout.
              </InfoTooltip>
            }
            onValueChange={handleOperationTimeoutChange}
          >
            <Timer />
            Timeout
          </DropdownMenuSelectItem>
        ) : undefined}
        {kernelSettings}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
