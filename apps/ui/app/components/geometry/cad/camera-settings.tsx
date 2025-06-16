import React, { useCallback, useState } from 'react';
import type { ClassValue } from 'clsx';
import { Settings } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { Button } from '~/components/ui/button.js';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  const withMesh = useSelector(graphicsActor, (state) => state.context.withMesh);
  const withLines = useSelector(graphicsActor, (state) => state.context.withLines);
  const withGizmo = useSelector(graphicsActor, (state) => state.context.withGizmo);
  const withGrid = useSelector(graphicsActor, (state) => state.context.withGrid);
  const withAxesHelper = useSelector(graphicsActor, (state) => state.context.withAxesHelper);

  const [isOpen, setIsOpen] = useState(false);

  const handleMeshToggle = useCallback((checked: boolean) => {
    graphicsActor.send({ type: 'setMeshVisibility', payload: checked });
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
        <TooltipContent>Camera settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        className="w-56"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <DropdownMenuLabel>Visibility</DropdownMenuLabel>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleMeshToggle(!withMesh);
          }}
          onSelect={preventClose}
        >
          <span>Show Mesh</span>
          <Switch variant="dropdown" checked={withMesh} onCheckedChange={handleMeshToggle} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleLinesToggle(!withLines);
          }}
          onSelect={preventClose}
        >
          <span>Show Lines</span>
          <Switch variant="dropdown" checked={withLines} onCheckedChange={handleLinesToggle} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleGizmoToggle(!withGizmo);
          }}
          onSelect={preventClose}
        >
          <span>Show Gizmo</span>
          <Switch variant="dropdown" checked={withGizmo} onCheckedChange={handleGizmoToggle} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleGridToggle(!withGrid);
          }}
          onSelect={preventClose}
        >
          <span>Show Grid</span>
          <Switch variant="dropdown" checked={withGrid} onCheckedChange={handleGridToggle} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleAxesHelperToggle(!withAxesHelper);
          }}
          onSelect={preventClose}
        >
          <span>Show Axes Helper</span>
          <Switch variant="dropdown" checked={withAxesHelper} onCheckedChange={handleAxesHelperToggle} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
