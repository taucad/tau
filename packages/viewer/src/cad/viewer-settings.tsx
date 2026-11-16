import { useViewerControlSize } from '#cad/viewer-control-size.js';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { ClassValue } from 'clsx';
import {
  Aperture,
  Axis3D,
  Box,
  Grid3X3,
  Info,
  Lock,
  LockOpen,
  Rotate3D,
  Ruler,
  Settings,
  Spline,
  Sparkles,
  ArrowUp,
  Timer,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuToggleGroupItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { cn } from '@taucad/ui/utils/cn';
import { ModifiedIndicator } from '@taucad/ui/components/modified-indicator';
import { AxisLabel } from '#cad/section-tool-row.jsx';
import { InfoTooltip } from '@taucad/ui/components/info-tooltip';
import { DropdownMenuSliderItem, preventMenuSliderEscapeDismissal } from '@taucad/ui/components/menu-slider-item';
import { useCameraRig, useCameraSelector, useGraphics, useGraphicsSelector } from '#hooks/use-graphics.jsx';
import { clamp } from '@taucad/ui/utils/number';
import { formatNumberEngineeringNotation } from '#utils/number.js';
import { gridUnitOptions, maxGridDigits } from '#cad/grid-unit-options.js';
import { keepMenuOpen, SettingsSubViewRow } from '#cad/settings-sub-view-row.jsx';
import { measureViewerSettingsPlacement } from '#cad/viewer-settings-placement.js';
import type { ViewerSettingsPlacement } from '#cad/viewer-settings-placement.js';
import { useViewerViewFields, viewerViewFieldPaths } from '#cad/viewer-view-fields.jsx';
import type { ViewerViewFieldPath, ViewerViewFields } from '#cad/viewer-view-fields.jsx';

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

/** The line under a leaf the person sets and this view does not. */
const fromMyDefaults = 'From my defaults';
/** The line beside the dot of a leaf this view sets. */
const setInThisView = 'Set in this view';

/** What one leaf's marks show in the menu: none without the host's `sourceOf`. */
type LeafMark = Readonly<{
  /** The person sets the leaf and this view does not. */
  isFromDefaults: boolean;
  /** The view sets the leaf: the dot's tooltip and its reset. */
  reset?: Readonly<{ tooltip: string; onReset: () => void }>;
}>;

const noMark: LeafMark = { isFromDefaults: false };

/**
 * One leaf's marks, from the host's view commands.
 *
 * @param viewFields - The host's view commands.
 * @param leaf - The leaf.
 * @returns The marks; none when the host gives no `sourceOf`.
 */
const leafMark = (viewFields: ViewerViewFields | undefined, leaf: ViewerViewFieldPath): LeafMark => {
  const source = viewFields?.sourceOf?.(leaf);
  if (viewFields === undefined || source === undefined || source === 'tau') {
    return noMark;
  }
  if (source === 'person') {
    return { isFromDefaults: true };
  }
  const tooltip = viewFields.inheritsFrom?.(leaf) === 'person' ? 'Reset to my default' : 'Reset to Tau default';
  return {
    isFromDefaults: false,
    reset: {
      tooltip,
      onReset: () => {
        viewFields.reset(leaf);
      },
    },
  };
};

/**
 * The dot beside a leaf this view sets; pressing it resets the leaf.
 *
 * @param props - The leaf's marks.
 * @returns The dot, or nothing when the view does not set the leaf.
 */
function LeafDot({ mark }: { readonly mark: LeafMark }): React.JSX.Element | undefined {
  return mark.reset ? (
    <ModifiedIndicator tooltip={mark.reset.tooltip} tooltipSide='right' onReset={mark.reset.onReset} />
  ) : undefined;
}

/**
 * A switch row's second line: "From my defaults" when the person sets the leaf and this view does not, or the dot and
 * "Set in this view" when the view sets it. The dot sits on this line, not in the title, so the switch's name stays its
 * title.
 *
 * @param mark - The leaf's marks.
 * @param otherwise - The row's own second line, if it has one.
 * @returns The line, or `undefined` for none.
 */
const sourceLine = (mark: LeafMark, otherwise?: string): React.ReactNode => {
  const own = otherwise === undefined ? '' : ` · ${otherwise}`;
  if (mark.isFromDefaults) {
    return `${fromMyDefaults}${own}`;
  }
  if (mark.reset) {
    return (
      <span className='flex items-center gap-1'>
        <LeafDot mark={mark} />
        {`${setInThisView}${own}`}
      </span>
    );
  }
  return otherwise;
};

/** A line of text in the phone drawer starts at the drawer rows' 16px inset, where their icons and labels start. */
const inSettingsDrawerInset = 'in-[[data-slot=dropdown-menu-drawer-items]]:px-4';

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
  /**
   * The side of the trigger the menu opens on. Inside a viewer bar the menu opens to the right of the bar when the
   * viewer pane has room for it; this side and `align` are where it opens otherwise. A centred bar opens it upward.
   */
  readonly side?: DropdownMenuContentProps['side'];
  /** How the menu aligns against the trigger when it does not open beside the bar. */
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
  const mark = leafMark(viewFields, 'fieldOfView');
  /* The angle a view command is still writing, which the next step counts from until the camera shows it. `write`
   * names the command, so an older write that is refused never clears a newer angle. */
  const pendingRef = useRef<Readonly<{ angle: number; write: number }> | undefined>(undefined);
  const writesRef = useRef(0);
  useEffect(() => {
    if (pendingRef.current?.angle === fieldOfView) {
      pendingRef.current = undefined;
    }
  }, [fieldOfView]);

  // The camera throws on an angle outside its range, so typed values are clamped as well as stepped ones.
  const setFieldOfView = useCallback(
    (value: number) => {
      const verticalFieldOfView = clamp(Math.round(value), 0, maxVerticalFieldOfView);
      if (!viewFields) {
        cameraRig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView });
        return;
      }
      const written = viewFields.set('fieldOfView', verticalFieldOfView);
      if (written === undefined) {
        return;
      }
      writesRef.current += 1;
      const write = writesRef.current;
      pendingRef.current = { angle: verticalFieldOfView, write };
      const forgetRefused = async (): Promise<void> => {
        let saved = false;
        try {
          saved = await written;
        } catch {
          // The host reports its own failure.
        }
        if (!saved && pendingRef.current?.write === write) {
          pendingRef.current = undefined;
        }
      };
      void forgetRefused();
    },
    [cameraRig, viewFields],
  );

  const stepFieldOfView = useCallback(
    (direction: -1 | 1, { shift }: { shift: boolean }) => {
      const from = pendingRef.current?.angle ?? fieldOfView;
      setFieldOfView(from + direction * (shift ? shiftVerticalFieldOfViewStep : 1));
    },
    [fieldOfView, setFieldOfView],
  );

  return (
    <>
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
      {mark.isFromDefaults || mark.reset ? (
        <div
          data-slot='viewer-field-of-view-source'
          className={cn('flex items-center gap-2 px-3 pb-1.5 text-xs text-muted-foreground', inSettingsDrawerInset)}
        >
          <LeafDot mark={mark} />
          {mark.isFromDefaults ? fromMyDefaults : setInThisView}
        </div>
      ) : undefined}
    </>
  );
}

/**
 * Grid & units: the grid size and its unit, opening the Unit list, the Lock grid size switch and the zoom hint. The
 * sub-view stays open on a choice, as it holds more than one control.
 *
 * @returns The row and its sub-view; nothing until the grid has a size.
 */
function GridUnitsRow(): React.JSX.Element | undefined {
  const graphicsRef = useGraphics();
  const viewFields = useViewerViewFields();
  const gridSizes = useGraphicsSelector((state) => state.context.gridSizes);
  const isGridSizeLocked = useGraphicsSelector((state) => state.context.isGridSizeLocked);
  const metersPerDisplayUnit = useGraphicsSelector((state) => state.context.displayUnits.length.metersPerUnit);
  const unit = useGraphicsSelector((state) => state.context.displayUnits.length.symbol);
  const mark = leafMark(viewFields, 'grid.unit');

  const handleUnitChange = useCallback(
    (selectedUnit: string) => {
      if (viewFields) {
        void viewFields.set('grid.unit', selectedUnit);
        return;
      }
      graphicsRef.send({ type: 'setGridUnit', payload: { unit: selectedUnit } });
    },
    [graphicsRef, viewFields],
  );
  const handleLockToggle = useCallback(
    (checked: boolean) => {
      graphicsRef.send({ type: 'setGridSizeLocked', payload: checked });
    },
    [graphicsRef],
  );

  if (!gridSizes.smallSize) {
    return undefined;
  }
  const gridLabel = `${formatNumberEngineeringNotation(gridSizes.smallSize / metersPerDisplayUnit, maxGridDigits)} ${unit}`;

  return (
    <SettingsSubViewRow
      icon={<Ruler />}
      label='Grid & units'
      value={
        <>
          <LeafDot mark={mark} />
          <span className='truncate'>{gridLabel}</span>
          {isGridSizeLocked ? <Lock aria-hidden='true' className='size-3' /> : undefined}
        </>
      }
      valueText={`${gridLabel}${isGridSizeLocked ? ', locked' : ''}`}
    >
      <DropdownMenuLabel>Unit</DropdownMenuLabel>
      <DropdownMenuRadioGroup aria-label='Unit' value={unit} onValueChange={handleUnitChange}>
        {gridUnitOptions.map((option) => (
          <DropdownMenuRadioItem
            key={option.value}
            className='flex items-center justify-between gap-2'
            value={option.value}
            onSelect={keepMenuOpen}
          >
            <span>{option.label}</span>
            <span className='flex w-8 items-center justify-center rounded-xs bg-neutral/20 px-1 py-0.5 font-mono text-xs'>
              {option.value}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Grid</DropdownMenuLabel>
      <DropdownMenuSwitchItem isChecked={isGridSizeLocked} onIsCheckedChange={handleLockToggle}>
        {isGridSizeLocked ? <Lock /> : <LockOpen />}
        Lock grid size ({gridLabel})
      </DropdownMenuSwitchItem>
      <span
        className={cn(
          'inline-flex items-center gap-1 p-2 text-xs font-medium text-muted-foreground/80',
          inSettingsDrawerInset,
        )}
      >
        <Info className='size-3 stroke-2' /> Adjust grid size by changing zoom level
      </span>
    </SettingsSubViewRow>
  );
}

/**
 * Timeout: the CAD operation timeout, opening its options. Choosing one steps back to the menu.
 *
 * @param props - The embedder's timeout.
 * @returns The row and its sub-view.
 */
function TimeoutRow({ operationTimeout }: { readonly operationTimeout: ViewerOperationTimeout }): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const { value, defaultValue, onChange } = operationTimeout;
  const current =
    timeoutOptions.find((option) => option.value === value) ??
    timeoutOptions.find((option) => option.value === defaultValue) ??
    timeoutOptions[0]!;
  const handleChange = useCallback(
    (next: string) => {
      onChange(Number(next));
      setIsOpen(false);
    },
    [onChange],
  );
  return (
    <SettingsSubViewRow
      icon={<Timer />}
      label='Timeout'
      value={current.label}
      infoTooltip={
        <InfoTooltip>
          Maximum time to wait for CAD rendering before timing out.
          <br /> Set to &quot;Disabled&quot; to turn off timeout.
        </InfoTooltip>
      }
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      <DropdownMenuLabel>Timeout</DropdownMenuLabel>
      {/* The sub-view is the group named Timeout; its radio rows need no second name. */}
      <DropdownMenuRadioGroup value={String(current.value)} onValueChange={handleChange}>
        {timeoutOptions.map((option) => (
          <DropdownMenuRadioItem key={option.value} value={String(option.value)} onSelect={keepMenuOpen}>
            {option.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </SettingsSubViewRow>
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<ViewerSettingsPlacement>({ side, align });
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        // Decided as the menu opens, before it is placed, and kept while it is open.
        setPlacement(measureViewerSettingsPlacement(triggerRef.current ?? undefined, { side, align }));
      }
      setIsOpen(next);
    },
    [align, side],
  );
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
  const marks = useMemo(
    () =>
      Object.fromEntries(viewerViewFieldPaths.map((leaf) => [leaf, leafMark(viewFields, leaf)])) as Record<
        ViewerViewFieldPath,
        LeafMark
      >,
    [viewFields],
  );
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

  const controlSize = useViewerControlSize();

  return (
    // On a phone the settings open in a bottom drawer (the responsive menu), where the placement is not read.
    <DropdownMenu isResponsive open={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              ref={triggerRef}
              variant='overlay'
              size={controlSize}
              aria-label='Viewer settings'
              className={cn(className)}
            >
              <Settings />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side='top'>Viewer settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align={placement.align}
        side={placement.side}
        sideOffset={placement.sideOffset}
        alignOffset={placement.alignOffset}
        // Its width is the placement's `viewerSettingsMenuWidthPx`.
        className='w-72'
        drawerTitle='Viewer settings'
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
            <DropdownMenuSwitchItem
              icon={<Box />}
              description={sourceLine(marks['display.surfaces'])}
              isChecked={enableSurfaces}
              onIsCheckedChange={handlers.surfaces}
            >
              Surfaces
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem
              icon={<Spline />}
              description={sourceLine(marks['display.lines'])}
              isChecked={enableLines}
              onIsCheckedChange={handlers.lines}
            >
              Edges
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem
              icon={<Sparkles />}
              description={sourceLine(
                marks['display.matcap'],
                `Lighting effects are ${enableMatcap ? 'inactive' : 'active'}`,
              )}
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
          icon={<Rotate3D />}
          description={sourceLine(marks['display.gizmo'])}
          isChecked={enableGizmo}
          onIsCheckedChange={handlers.gizmo}
        >
          Gizmo
        </DropdownMenuSwitchItem>
        <DropdownMenuSwitchItem
          icon={<Grid3X3 />}
          description={sourceLine(marks['display.grid'])}
          isChecked={enableGrid}
          onIsCheckedChange={handlers.grid}
        >
          Grid
        </DropdownMenuSwitchItem>
        <DropdownMenuSwitchItem
          icon={<Axis3D />}
          description={sourceLine(marks['display.axes'])}
          isChecked={enableAxes}
          onIsCheckedChange={handlers.axes}
        >
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
              <LeafDot mark={marks.upDirection} />
            </DropdownMenuToggleGroupItem>
            <FieldOfViewRow />
          </>
        )}
        <GridUnitsRow />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Rendering</DropdownMenuLabel>
        {operationTimeout ? <TimeoutRow operationTimeout={operationTimeout} /> : undefined}
        {kernelSettings}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
