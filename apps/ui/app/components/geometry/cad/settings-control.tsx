import React, { useCallback, useState, useEffect } from 'react';
import type { ClassValue } from 'clsx';
import { Axis3D, Box, Grid3X3, Rotate3D, Settings, PenLine, Sparkles, RotateCw } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Button } from '#components/ui/button.js';
import { useBuild } from '#hooks/use-build.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { cn } from '#utils/ui.utils.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { InfoTooltip } from '#components/ui/info-tooltip.js';

type ViewSettings = {
  surface: boolean;
  lines: boolean;
  gizmo: boolean;
  grid: boolean;
  axes: boolean;
  matcap: boolean;
  yupRotation: boolean;
};

// Default settings
const defaultSettings: ViewSettings = {
  surface: true,
  lines: true,
  gizmo: true,
  grid: true,
  axes: true,
  matcap: false,
  yupRotation: false,
};

type CameraSettingsProps = {
  /**
   * Optional className for styling
   */
  readonly className?: ClassValue;
};

/**
 * Component that provides camera and visibility settings for the 3D viewer
 */
export function SettingsControl({ className }: CameraSettingsProps): React.ReactNode {
  const { graphicsRef: graphicsActor } = useBuild();
  const [viewSettings, setViewSettings] = useCookie<ViewSettings>(cookieName.viewSettings, defaultSettings);
  const [isOpen, setIsOpen] = useState(false);
  const is2dGeometry = useSelector(graphicsActor, (state) =>
    state.context.geometries.some((geometry) => geometry.format === 'svg'),
  );

  // Synchronize each setting to the Graphics context when settings change
  useEffect(() => {
    graphicsActor.send({ type: 'setSurfaceVisibility', payload: viewSettings.surface });
  }, [viewSettings.surface, graphicsActor]);

  useEffect(() => {
    graphicsActor.send({ type: 'setLinesVisibility', payload: viewSettings.lines });
  }, [viewSettings.lines, graphicsActor]);

  useEffect(() => {
    graphicsActor.send({ type: 'setGizmoVisibility', payload: viewSettings.gizmo });
  }, [viewSettings.gizmo, graphicsActor]);

  useEffect(() => {
    graphicsActor.send({ type: 'setGridVisibility', payload: viewSettings.grid });
  }, [viewSettings.grid, graphicsActor]);

  useEffect(() => {
    graphicsActor.send({ type: 'setAxesVisibility', payload: viewSettings.axes });
  }, [viewSettings.axes, graphicsActor]);

  useEffect(() => {
    graphicsActor.send({ type: 'setMatcapVisibility', payload: viewSettings.matcap });
  }, [viewSettings.matcap, graphicsActor]);

  useEffect(() => {
    graphicsActor.send({ type: 'setYupRotationVisibility', payload: viewSettings.yupRotation });
  }, [viewSettings.yupRotation, graphicsActor]);

  const handleMeshToggle = useCallback(
    (checked: boolean) => {
      setViewSettings((previous) => ({ ...previous, surface: checked }));
    },
    [setViewSettings],
  );

  const handleLinesToggle = useCallback(
    (checked: boolean) => {
      setViewSettings((previous) => ({ ...previous, lines: checked }));
    },
    [setViewSettings],
  );

  const handleGizmoToggle = useCallback(
    (checked: boolean) => {
      setViewSettings((previous) => ({ ...previous, gizmo: checked }));
    },
    [setViewSettings],
  );

  const handleGridToggle = useCallback(
    (checked: boolean) => {
      setViewSettings((previous) => ({ ...previous, grid: checked }));
    },
    [setViewSettings],
  );

  const handleAxesHelperToggle = useCallback(
    (checked: boolean) => {
      setViewSettings((previous) => ({ ...previous, axes: checked }));
    },
    [setViewSettings],
  );

  const handleMatcapToggle = useCallback(
    (checked: boolean) => {
      setViewSettings((previous) => ({ ...previous, matcap: checked }));
    },
    [setViewSettings],
  );

  const handleYupRotationToggle = useCallback(
    (checked: boolean) => {
      setViewSettings((previous) => ({ ...previous, yupRotation: checked }));
    },
    [setViewSettings],
  );

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="overlay" size="icon" className={cn(className)}>
              <Settings />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Viewer settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        side="right"
        className="w-64"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        {!is2dGeometry && (
          <>
            <DropdownMenuLabel>Model</DropdownMenuLabel>
            <DropdownMenuSwitchItem
              className="flex w-full justify-between"
              isChecked={viewSettings.surface}
              onIsCheckedChange={handleMeshToggle}
            >
              <span className="flex items-center gap-2">
                <Box />
                Surfaces
              </span>
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem
              className="flex w-full justify-between"
              isChecked={viewSettings.lines}
              onIsCheckedChange={handleLinesToggle}
            >
              <span className="flex items-center gap-2">
                <PenLine />
                Lines
              </span>
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem
              className="flex h-10 w-full justify-between"
              isChecked={viewSettings.matcap}
              onIsCheckedChange={handleMatcapToggle}
            >
              <span className="flex items-center gap-2">
                <Sparkles />
                <div className="flex flex-col">
                  <span className="flex items-center gap-1">
                    Matcap{' '}
                    <InfoTooltip>
                      A material that gives models a consistent appearance independent of scene lighting.
                      <br /> Rendering performance is improved with this enabled.
                    </InfoTooltip>
                  </span>
                  <span className="text-xs font-medium text-muted-foreground/80">
                    Lighting effects are {viewSettings.matcap ? 'inactive' : 'active'}
                  </span>
                </div>
              </span>
            </DropdownMenuSwitchItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>Viewport</DropdownMenuLabel>
        <DropdownMenuSwitchItem
          className={cn('flex w-full justify-between', is2dGeometry && 'hidden')}
          isChecked={viewSettings.gizmo}
          onIsCheckedChange={handleGizmoToggle}
        >
          <span className="flex items-center gap-2">
            <Rotate3D />
            Gizmo
          </span>
        </DropdownMenuSwitchItem>
        <DropdownMenuSwitchItem
          className="flex w-full justify-between"
          isChecked={viewSettings.grid}
          onIsCheckedChange={handleGridToggle}
        >
          <span className="flex items-center gap-2">
            <Grid3X3 />
            Grid
          </span>
        </DropdownMenuSwitchItem>
        <DropdownMenuSwitchItem
          className="flex w-full justify-between"
          isChecked={viewSettings.axes}
          onIsCheckedChange={handleAxesHelperToggle}
        >
          <span className="flex items-center gap-2">
            <Axis3D />
            Axes
          </span>
        </DropdownMenuSwitchItem>
        <DropdownMenuSwitchItem
          className={cn('flex w-full justify-between', is2dGeometry && 'hidden')}
          isChecked={viewSettings.yupRotation}
          onIsCheckedChange={handleYupRotationToggle}
        >
          <span className="flex items-center gap-2">
            <RotateCw />
            Y-up Rotation
          </span>
        </DropdownMenuSwitchItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
