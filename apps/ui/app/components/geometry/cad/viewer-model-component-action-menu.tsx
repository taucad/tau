import { useCallback } from 'react';
import type { CSSProperties } from 'react';
import { ModelComponentViewerMenuItems } from '#components/geometry/cad/model-component-action-menu.js';
import type { ModelComponentActionMenuData } from '#components/geometry/cad/model-component-action-menu.js';
import { Popover, PopoverAnchor, PopoverContent } from '#components/ui/popover.js';
import { menuContentVariants } from '#components/ui/menu.variants.js';
import { preventMenuSliderEscapeDismissal } from '#components/ui/menu-slider-item.js';
import { cn } from '#utils/ui.utils.js';

export type ViewerModelComponentActionMenuPoint = {
  readonly clientX: number;
  readonly clientY: number;
};

type ViewerModelComponentActionMenuProperties = {
  readonly data: ModelComponentActionMenuData | undefined;
  readonly point: ViewerModelComponentActionMenuPoint | undefined;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
};

export function ViewerModelComponentActionMenu({
  data,
  point,
  isOpen: shouldOpen,
  onOpenChange,
}: ViewerModelComponentActionMenuProperties): React.JSX.Element {
  const isOpen = shouldOpen && Boolean(data && point);
  const handleRequestClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Popover open={isOpen} modal={false} onOpenChange={onOpenChange}>
      {point ? (
        <PopoverAnchor asChild>
          <span aria-hidden='true' style={getViewerMenuAnchorStyle(point)} />
        </PopoverAnchor>
      ) : null}
      {isOpen && data ? (
        <PopoverContent
          role='menu'
          side='right'
          align='start'
          sideOffset={2}
          collisionPadding={8}
          className={cn(
            menuContentVariants(),
            'max-h-[min(24rem,calc(100vh-1rem))] w-auto min-w-56 overflow-x-hidden overflow-y-auto border-0 p-0.75 shadow-menu',
          )}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
          onEscapeKeyDown={preventMenuSliderEscapeDismissal}
        >
          <ModelComponentViewerMenuItems {...data} onRequestClose={handleRequestClose} />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

function getViewerMenuAnchorStyle(point: ViewerModelComponentActionMenuPoint): CSSProperties {
  return {
    position: 'fixed',
    left: point.clientX,
    top: point.clientY,
    width: 0,
    height: 0,
    pointerEvents: 'none',
  };
}
