import React, { useCallback, useState } from 'react';
import type { ClassValue } from 'clsx';
import { Axis3D, Box, Grid3X3, Rotate3D, Settings, PenLine } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { Button } from '~/components/ui/button.js';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu.js';
import { Switch } from '~/components/ui/switch.js';
import { cn } from '~/utils/ui.js';

type CameraSettingsProps = {
  /**
   * Optional className for styling
   */
  readonly className?: ClassValue;
};

/**
 * Component that provides camera and visibility settings for the 3D viewer
 */
export function CameraSettings({ className }: CameraSettingsProps): React.ReactNode {
  const enableSurface = useSelector(graphicsActor, (state) => state.context.enableSurface);
  const enableLines = useSelector(graphicsActor, (state) => state.context.enableLines);
  const enableGizmo = useSelector(graphicsActor, (state) => state.context.enableGizmo);
  const enableGrid = useSelector(graphicsActor, (state) => state.context.enableGrid);
  const enableAxesHelper = useSelector(graphicsActor, (state) => state.context.enableAxesHelper);

  const [isOpen, setIsOpen] = useState(false);

  const handleMeshToggle = useCallback((checked: boolean) => {
    graphicsActor.send({ type: 'setSurfaceVisibility', payload: checked });
  }, []);

  const handleLinesToggle = useCallback((checked: boolean) => {
    graphicsActor.send({ type: 'setLinesVisibility', payload: checked });
  }, []);

  const handleGizmoToggle = useCallback((checked: boolean) => {
    graphicsActor.send({ type: 'setGizmoVisibility', payload: checked });
  }, []);

  const handleGridToggle = useCallback((checked: boolean) => {
    graphicsActor.send({ type: 'setGridVisibility', payload: checked });
  }, []);

  const handleAxesHelperToggle = useCallback((checked: boolean) => {
    graphicsActor.send({ type: 'setAxesHelperVisibility', payload: checked });
  }, []);

  const preventClose = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="overlay" size="icon" className={cn('', className)}>
              <Settings />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">Camera settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <DropdownMenuLabel>Model</DropdownMenuLabel>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleMeshToggle(!enableSurface);
          }}
          onSelect={preventClose}
        >
          <span className="flex items-center gap-2">
            <Box />
            Surface
          </span>
          <Switch variant="dropdown" checked={enableSurface} onCheckedChange={handleMeshToggle} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleLinesToggle(!enableLines);
          }}
          onSelect={preventClose}
        >
          <span className="flex items-center gap-2">
            <PenLine />
            Lines
          </span>
          <Switch variant="dropdown" checked={enableLines} onCheckedChange={handleLinesToggle} />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Viewport</DropdownMenuLabel>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleGizmoToggle(!enableGizmo);
          }}
          onSelect={preventClose}
        >
          <span className="flex items-center gap-2">
            <Rotate3D />
            Gizmo
          </span>
          <Switch variant="dropdown" checked={enableGizmo} onCheckedChange={handleGizmoToggle} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleGridToggle(!enableGrid);
          }}
          onSelect={preventClose}
        >
          <span className="flex items-center gap-2">
            <Grid3X3 />
            Grid
          </span>
          <Switch variant="dropdown" checked={enableGrid} onCheckedChange={handleGridToggle} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleAxesHelperToggle(!enableAxesHelper);
          }}
          onSelect={preventClose}
        >
          <span className="flex items-center gap-2">
            <Axis3D />
            Axes
          </span>
          <Switch variant="dropdown" checked={enableAxesHelper} onCheckedChange={handleAxesHelperToggle} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
