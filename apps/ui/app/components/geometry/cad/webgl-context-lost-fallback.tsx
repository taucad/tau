import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '#components/ui/button.js';

type WebglContextLostFallbackProps = {
  readonly onRetry: () => void;
};

/**
 * Lightweight DOM-only fallback shown when the WebGL context is lost mid-session
 * (e.g. GPU reset, driver crash, or browser reclaiming contexts).
 * Provides a single "Retry" action that remounts the Canvas.
 */
export function WebglContextLostFallback({ onRetry }: WebglContextLostFallbackProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-muted-foreground">
      <AlertTriangle className="size-12 stroke-1" />
      <div className="flex max-w-xs flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-foreground">Graphics context lost</p>
        <p className="text-xs">The WebGL rendering context was lost. This can happen when too many viewers are open.</p>
      </div>
      <Button variant="default" size="sm" className="gap-2" onClick={onRetry}>
        <RotateCcw className="size-4" />
        Retry
      </Button>
    </div>
  );
}
