import type { RefObject } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';

/**
 * Tracks fullscreen state for `targetRef` and toggles via the Fullscreen API.
 * Shared by the overlay control and the F shortcut on the publication
 * viewer route (`useKeybinding` in `publication-viewer-pane.tsx`).
 */
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React `useRef(null)` / `Ref` use null for unattached refs per React typings
export function usePublicationFullscreen(targetRef: RefObject<HTMLElement | null>): {
  readonly isFullscreen: boolean;
  readonly toggleFullscreen: () => Promise<void>;
} {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = (): void => {
      setIsFullscreen(document.fullscreenElement === targetRef.current);
    };

    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, [targetRef]);

  const toggleFullscreen = useCallback(async (): Promise<void> => {
    const node = targetRef.current;
    if (!node) {
      return;
    }

    if (document.fullscreenElement === node) {
      await document.exitFullscreen();
      return;
    }

    await node.requestFullscreen();
  }, [targetRef]);

  return { isFullscreen, toggleFullscreen };
}

type PublicationFullscreenButtonProps = {
  readonly isFullscreen: boolean;
  readonly toggleFullscreen: () => Promise<void>;
  readonly className?: string;
};

/**
 * Fullscreen toggle for the publication viewer pane. Parents supply state via
 * `usePublicationFullscreen` so keyboard shortcuts and this button stay in
 * sync.
 */
export function PublicationFullscreenButton({
  isFullscreen,
  toggleFullscreen,
  className,
}: PublicationFullscreenButtonProps): React.JSX.Element {
  const label = isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
  const Icon = isFullscreen ? Minimize2 : Maximize2;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='overlay'
          size='icon'
          className={cn('size-10 rounded-xl shadow-md', className)}
          aria-label={`${label} (shortcut F)`}
          onClick={() => {
            void toggleFullscreen();
          }}
        >
          <Icon className='size-5' />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{`${label} (F)`}</TooltipContent>
    </Tooltip>
  );
}
