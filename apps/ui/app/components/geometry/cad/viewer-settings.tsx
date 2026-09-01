import React, { useCallback, useState, useMemo } from 'react';
import type { ClassValue } from 'clsx';
import {
  Axis3D,
  Box,
  Grid3X3,
  Layers,
  Rotate3D,
  Settings,
  PenLine,
  Sparkles,
  ArrowUp,
  Timer,
  Lightbulb,
  Check,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuSelectItem,
  DropdownMenuToggleGroupItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { cn } from '#utils/ui.utils.js';
import { InfoTooltip } from '#components/ui/info-tooltip.js';
import { axesColors } from '#constants/color.constants.js';
import type { EnvironmentPreset, GraphicsBackendPreference } from '#constants/editor.constants.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';
import { useCad, useCadSelector } from '#hooks/use-cad.js';
import { BetaBadge } from '#components/release-badge.js';

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
  { value: 300_000, label: '5 min' },
  { value: 600_000, label: '10 min' },
];

const upDirectionOptions: Array<{ value: UpDirection; label: React.ReactNode; ariaLabel: string }> = [
  { value: 'x', label: <span style={{ color: axesColors.x }}>X</span>, ariaLabel: 'X-up' },
  { value: 'y', label: <span style={{ color: axesColors.y }}>Y</span>, ariaLabel: 'Y-up' },
  { value: 'z', label: <span style={{ color: axesColors.z }}>Z</span>, ariaLabel: 'Z-up' },
];

type EnvironmentPresetOption = {
  readonly id: EnvironmentPreset;
  readonly label: string;
  readonly description: string;
};

function isEnvironmentPreset(value: string): value is EnvironmentPreset {
  return value === 'studio' || value === 'performance';
}

const environmentPresetOptions: EnvironmentPresetOption[] = [
  {
    id: 'studio',
    label: 'Studio',
    description: 'Full lighting rig with reflections',
  },
  {
    id: 'performance',
    label: 'Performance',
    description: 'Minimal lights for best performance',
  },
];

const graphicsBackendOptions: Array<{
  id: GraphicsBackendPreference;
  label: string;
  description: string;
  isBeta?: boolean;
}> = [
  {
    id: 'webgl',
    label: 'WebGL',
    description: 'Stable default; widest browser support.',
  },
  {
    id: 'webgpu',
    label: 'WebGPU',
    description: 'Faster when supported; falls back automatically if unavailable.',
    isBeta: true,
  },
];

type ViewerSettingsProps = {
  /**
   * Optional className for styling
   */
  readonly className?: ClassValue;
  /**
   * Controls that have overflowed from the toolbar, rendered at the top of the dropdown.
   * When undefined or empty, the dropdown renders exactly as usual.
   */
  readonly overflowControls?: React.ReactNode;
};

/**
 * Component that provides camera and visibility settings for the 3D viewer.
 * All settings are per-view, read from the per-view GraphicsMachine state via GraphicsProvider
 * and the per-view CadMachine state via CadProvider.
 */
export function ViewerSettings({ className, overflowControls }: ViewerSettingsProps): React.ReactNode {
  const graphicsRef = useGraphics();

  const [isOpen, setIsOpen] = useState(false);

  // Read all settings from per-view graphicsMachine state via context
  const enableSurfaces = useGraphicsSelector((state) => state.context.enableSurfaces);
  const enableLines = useGraphicsSelector((state) => state.context.enableLines);
  const enableGizmo = useGraphicsSelector((state) => state.context.enableGizmo);
  const enableGrid = useGraphicsSelector((state) => state.context.enableGrid);
  const enableAxes = useGraphicsSelector((state) => state.context.enableAxes);
  const enableMatcap = useGraphicsSelector((state) => state.context.enableMatcap);
  const enablePostProcessing = useGraphicsSelector((state) => state.context.enablePostProcessing);
  const environmentPreset = useGraphicsSelector((state) => state.context.environmentPreset);
  const graphicsBackendPreference = useGraphicsSelector((state) => state.context.graphicsBackendPreference);
  const webGpuAvailable = useGraphicsSelector((state) => state.context.webGpuAvailable);
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);
  const is2dGeometry = useGraphicsSelector((state) =>
    state.context.geometries.some((geometry) => geometry.format === 'svg'),
  );

  const cadRef = useCad();
  const renderTimeout = useCadSelector((state) => state.context.renderTimeout, 30_000);

  const handleMeshToggle = useCallback(
    (checked: boolean) => {
      graphicsRef.send({ type: 'setSurfaceVisibility', payload: checked });
    },
    [graphicsRef],
  );

  const handleLinesToggle = useCallback(
    (checked: boolean) => {
      graphicsRef.send({ type: 'setLinesVisibility', payload: checked });
    },
    [graphicsRef],
  );

  const handleGizmoToggle = useCallback(
    (checked: boolean) => {
      graphicsRef.send({ type: 'setGizmoVisibility', payload: checked });
    },
    [graphicsRef],
  );

  const handleGridToggle = useCallback(
    (checked: boolean) => {
      graphicsRef.send({ type: 'setGridVisibility', payload: checked });
    },
    [graphicsRef],
  );

  const handleAxesHelperToggle = useCallback(
    (checked: boolean) => {
      graphicsRef.send({ type: 'setAxesVisibility', payload: checked });
    },
    [graphicsRef],
  );

  const handleMatcapToggle = useCallback(
    (checked: boolean) => {
      graphicsRef.send({ type: 'setMatcapVisibility', payload: checked });
    },
    [graphicsRef],
  );

  const handlePostProcessingToggle = useCallback(
    (checked: boolean) => {
      graphicsRef.send({ type: 'setPostProcessingVisibility', payload: checked });
    },
    [graphicsRef],
  );

  const handleEnvironmentPresetChange = useCallback(
    (value: string) => {
      if (!isEnvironmentPreset(value)) {
        return;
      }

      graphicsRef.send({ type: 'setEnvironmentPreset', payload: value });
    },
    [graphicsRef],
  );

  const handleUpDirectionChange = useCallback(
    (value: UpDirection) => {
      graphicsRef.send({ type: 'setUpDirection', payload: value });
    },
    [graphicsRef],
  );

  const handleGraphicsBackendChange = useCallback(
    (value: string): void => {
      if (value !== 'webgl' && value !== 'webgpu') {
        return;
      }

      graphicsRef.send({ type: 'setGraphicsBackendPreference', payload: value });
    },
    [graphicsRef],
  );

  const currentGraphicsBackendOption = useMemo(() => {
    return (
      graphicsBackendOptions.find((option) => option.id === graphicsBackendPreference) ?? graphicsBackendOptions[0]!
    );
  }, [graphicsBackendPreference]);

  const handleRenderTimeoutChange = useCallback(
    (value: string) => {
      cadRef?.send({ type: 'setRenderTimeout', renderTimeout: Number(value) });
    },
    [cadRef],
  );

  const currentTimeoutOption = useMemo(
    () => timeoutOptions.find((option) => option.value === renderTimeout) ?? timeoutOptions[2]!,
    [renderTimeout],
  );

  const currentEnvironmentPresetOption = useMemo(
    () => environmentPresetOptions.find((option) => option.id === environmentPreset) ?? environmentPresetOptions[0]!,
    [environmentPreset],
  );

  const getGraphicsBackendValue = useCallback(
    (option: (typeof graphicsBackendOptions)[number]): string => option.id,
    [],
  );
  const getGraphicsBackendLabel = useCallback(
    (option: (typeof graphicsBackendOptions)[number]): string => {
      const suffix = option.id === 'webgpu' && !webGpuAvailable ? ' — falls back to WebGL' : '';
      return `${option.label}${suffix}`;
    },
    [webGpuAvailable],
  );

  const getEnvironmentPresetOptionValue = useCallback((option: EnvironmentPresetOption): string => option.id, []);
  const getEnvironmentPresetOptionLabel = useCallback((option: EnvironmentPresetOption): string => option.label, []);
  const getTimeoutValue = useCallback((option: TimeoutOption): string => String(option.value), []);
  const getTimeoutLabel = useCallback((option: TimeoutOption): string => option.label, []);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant='overlay' size='icon' className={cn(className)}>
              <Settings />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side='top'>Viewer settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align='end'
        side='right'
        className='w-72'
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        {!is2dGeometry && (
          <>
            <DropdownMenuLabel>Model</DropdownMenuLabel>
            <DropdownMenuSwitchItem isChecked={enableSurfaces} onIsCheckedChange={handleMeshToggle}>
              <Box />
              Surfaces
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem isChecked={enableLines} onIsCheckedChange={handleLinesToggle}>
              <PenLine />
              Lines
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem className='h-10' isChecked={enableMatcap} onIsCheckedChange={handleMatcapToggle}>
              <Sparkles />
              <div className='flex flex-col'>
                <span className='flex items-center gap-1'>
                  Matcap{' '}
                  <InfoTooltip>
                    A material that gives models a consistent appearance independent of scene lighting.
                    <br /> Rendering performance is improved with this enabled.
                  </InfoTooltip>
                </span>
                <span className='text-xs font-medium text-muted-foreground/80'>
                  Lighting effects are {enableMatcap ? 'inactive' : 'active'}
                </span>
              </div>
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem
              className='h-10'
              isChecked={enablePostProcessing}
              onIsCheckedChange={handlePostProcessingToggle}
            >
              <Layers />
              <div className='flex flex-col'>
                <span className='flex items-center gap-1'>
                  Post-processing{' '}
                  <InfoTooltip>
                    Enables screen-space ambient occlusion for more realistic depth and contact shadows.
                  </InfoTooltip>
                </span>
                <span className='text-xs font-medium text-muted-foreground/80'>
                  Ambient occlusion is {enablePostProcessing ? 'active' : 'inactive'}
                </span>
              </div>
            </DropdownMenuSwitchItem>
            <DropdownMenuSelectItem
              value={currentEnvironmentPresetOption}
              options={environmentPresetOptions}
              title='Environment preset'
              description='Choose lighting and environment preset for this viewer.'
              getOptionValue={getEnvironmentPresetOptionValue}
              getOptionLabel={getEnvironmentPresetOptionLabel}
              renderOption={(option, isSelected) => (
                <span className='flex w-full items-center justify-between gap-2'>
                  <span className='flex min-w-0 flex-1 flex-col'>
                    <span>{option.label}</span>
                    <span className='text-xs leading-snug whitespace-normal text-muted-foreground'>
                      {option.description}
                    </span>
                  </span>
                  {isSelected ? <Check className='size-4 shrink-0' /> : null}
                </span>
              )}
              selectPopoverContentClassName='min-w-72 w-auto max-w-[min(var(--radix-popover-content-available-width))]'
              shouldCloseOnSelect={() => false}
              infoTooltip={
                <InfoTooltip>
                  Lighting environment for the 3D viewer.
                  <br /> Studio offers full reflections; Performance minimizes light cost.
                </InfoTooltip>
              }
              onValueChange={handleEnvironmentPresetChange}
            >
              <Lightbulb />
              Environment
            </DropdownMenuSelectItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>Viewport</DropdownMenuLabel>
        <DropdownMenuSwitchItem
          className={cn(is2dGeometry && 'hidden')}
          isChecked={enableGizmo}
          onIsCheckedChange={handleGizmoToggle}
        >
          <Rotate3D />
          Gizmo
        </DropdownMenuSwitchItem>
        <DropdownMenuSwitchItem isChecked={enableGrid} onIsCheckedChange={handleGridToggle}>
          <Grid3X3 />
          Grid
        </DropdownMenuSwitchItem>
        <DropdownMenuSwitchItem isChecked={enableAxes} onIsCheckedChange={handleAxesHelperToggle}>
          <Axis3D />
          Axes
        </DropdownMenuSwitchItem>
        {!is2dGeometry && (
          <DropdownMenuToggleGroupItem
            value={upDirection}
            options={upDirectionOptions}
            onValueChange={handleUpDirectionChange}
          >
            <ArrowUp />
            Up Direction
          </DropdownMenuToggleGroupItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Rendering</DropdownMenuLabel>
        {!is2dGeometry && (
          <DropdownMenuSelectItem
            value={currentGraphicsBackendOption}
            options={graphicsBackendOptions}
            title='Graphics backend'
            description='WebGPU enables the modern renderer when the browser exposes an adapter.'
            getOptionValue={getGraphicsBackendValue}
            getOptionLabel={getGraphicsBackendLabel}
            renderOption={(option, isSelected) => (
              <span className='flex w-full items-center justify-between gap-2'>
                <span className='flex min-w-0 flex-1 flex-col'>
                  <span className='flex items-center gap-1.5'>
                    {option.label}
                    {option.isBeta ? <BetaBadge /> : null}
                  </span>
                  <span className='text-xs leading-snug whitespace-normal text-muted-foreground'>
                    {option.description}
                  </span>
                </span>
                {isSelected ? <Check className='size-4 shrink-0' /> : null}
              </span>
            )}
            selectPopoverContentClassName='min-w-72 w-auto max-w-[min(var(--radix-popover-content-available-width))]'
            shouldCloseOnSelect={() => false}
            infoTooltip={
              <InfoTooltip>
                WebGPU uses the experimental three.js renderer. Use WebGL if you hit compatibility issues.
              </InfoTooltip>
            }
            onValueChange={handleGraphicsBackendChange}
          >
            <Layers />
            Backend
          </DropdownMenuSelectItem>
        )}
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
          onValueChange={handleRenderTimeoutChange}
        >
          <Timer />
          Timeout
        </DropdownMenuSelectItem>
        {overflowControls !== undefined && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Controls</DropdownMenuLabel>
            {overflowControls}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
