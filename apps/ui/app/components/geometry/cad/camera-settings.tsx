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
  const enableMesh = useSelector(graphicsActor, (state) => state.context.enableMesh);
  const enableLines = useSelector(graphicsActor, (state) => state.context.enableLines);
  const enableGizmo = useSelector(graphicsActor, (state) => state.context.enableGizmo);
  const enableGrid = useSelector(graphicsActor, (state) => state.context.enableGrid);
  const enableAxesHelper = useSelector(graphicsActor, (state) => state.context.enableAxesHelper);

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
            handleMeshToggle(!enableMesh);
          }}
          onSelect={preventClose}
        >
          <span>Show Mesh</span>
          <Switch variant="dropdown" checked={enableMesh} onCheckedChange={handleMeshToggle} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleLinesToggle(!enableLines);
          }}
          onSelect={preventClose}
        >
          <span>Show Lines</span>
          <Switch variant="dropdown" checked={enableLines} onCheckedChange={handleLinesToggle} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleGizmoToggle(!enableGizmo);
          }}
          onSelect={preventClose}
        >
          <span>Show Gizmo</span>
          <Switch variant="dropdown" checked={enableGizmo} onCheckedChange={handleGizmoToggle} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleGridToggle(!enableGrid);
          }}
          onSelect={preventClose}
        >
          <span>Show Grid</span>
          <Switch variant="dropdown" checked={enableGrid} onCheckedChange={handleGridToggle} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full justify-between"
          onClick={() => {
            handleAxesHelperToggle(!enableAxesHelper);
          }}
          onSelect={preventClose}
        >
          <span>Show Axes Helper</span>
          <Switch variant="dropdown" checked={enableAxesHelper} onCheckedChange={handleAxesHelperToggle} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
