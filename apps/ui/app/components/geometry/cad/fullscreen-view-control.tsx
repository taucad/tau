import { useCallback, useState, useSyncExternalStore } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';

const subscribeFullscreen = (onChange: () => void): (() => void) => {
  document.addEventListener('fullscreenchange', onChange);
  return () => {
    document.removeEventListener('fullscreenchange', onChange);
  };
};
const readFullscreen = (): Element | undefined => document.fullscreenElement ?? undefined;
const readServerFullscreen = (): undefined => undefined;

/** Fullscreen the existing viewer in browsers and Electron, preserving its canvas and camera. */
export function FullscreenViewControl(): React.JSX.Element {
  const [viewer, setViewer] = useState<HTMLElement>();
  const setButton = useCallback<React.RefCallback<HTMLButtonElement>>((button) => {
    setViewer(button?.closest<HTMLElement>('[data-viewer-frame]') ?? undefined);
  }, []);
  const fullscreenElement = useSyncExternalStore(subscribeFullscreen, readFullscreen, readServerFullscreen);
  const isFullscreen = viewer !== undefined && fullscreenElement === viewer;
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';

  const toggleFullscreen = useCallback(async (): Promise<void> => {
    if (isPending) {
      return;
    }
    setError(undefined);
    if (!viewer || !document.fullscreenEnabled) {
      setError('Fullscreen is unavailable in this browser.');
      return;
    }

    setIsPending(true);
    try {
      await (document.fullscreenElement === viewer ? document.exitFullscreen() : viewer.requestFullscreen());
    } catch {
      setError('Unable to change fullscreen. Try again.');
    } finally {
      setIsPending(false);
    }
  }, [isPending, viewer]);

  return (
    <div className='relative flex'>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={setButton}
            variant='ghost'
            size='icon-sm'
            aria-label={label}
            aria-pressed={isFullscreen}
            aria-busy={isPending}
            aria-disabled={isPending}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize className='size-4' /> : <Maximize className='size-4' />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {error ? (
        <p
          role='alert'
          className='absolute right-0 bottom-full mb-2 w-64 rounded-md border bg-sidebar p-2 text-sm text-foreground'
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
