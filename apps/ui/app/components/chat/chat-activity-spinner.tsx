import { lazy, Suspense } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';

const loadMetalMorphLoader = async () => import('#components/geometry/loader/metal-morph-loader.js');

const MetalMorphLoaderLazy = lazy(async () => {
  const module = await loadMetalMorphLoader();
  return { default: module.MetalMorphLoader };
});

/**
 * One renderer serves every planning row of the session. The row comes and goes between the parts of a turn,
 * and a renderer of its own each time would mean the stand-in on every appearance and the same opening pose
 * replayed; pooled, the walk carries on where the last row left it.
 */
const chatSpinnerPoolKey = 'chat-activity-spinner';

/** Tier the spinner renders at; the pool key stands for it, so the warm-up and the mount must agree. */
const spinnerQuality = 'balanced';

/**
 * Build that renderer before a row needs it. Coming up costs a few hundred milliseconds of adapter probe,
 * studio environment and shader compile, which is exactly what the stand-in used to cover, so callers warm it
 * as soon as a turn is live rather than when the row appears. Repeat calls are free.
 */
export const warmChatActivitySpinner = async (theme: 'dark' | 'light'): Promise<void> => {
  const module = await loadMetalMorphLoader();
  await module.warmMetalMorphLoader({ poolKey: chatSpinnerPoolKey, theme, quality: spinnerQuality });
};

export type ChatActivitySpinnerProperties = Readonly<{
  className?: string;
}>;

/**
 * The planning indicator's spinner: the liquid-metal loader, decorative because the row's own text already
 * carries the status. Every other working row keeps the flat spinner, so at most one GPU surface runs per turn
 * and the brand loader marks the one row that stands for the turn itself.
 *
 * The flat spinner stands in only until the pooled renderer exists, which {@link warmChatActivitySpinner}
 * arranges before the first row appears; from then on every row adopts it and shows the body immediately.
 *
 * The slot is the same `size-3` box as every other row icon so icon and text columns line up; the canvas is
 * drawn at twice that, centred and overflowing, because the body only fills part of its frame. A glyph this
 * small needs the finer tier and a supersampled canvas, or the creases blur into the body's bright rim.
 */
export function ChatActivitySpinner({ className }: ChatActivitySpinnerProperties): React.JSX.Element {
  const flatSpinner = <LoaderCircle className='size-3 shrink-0 animate-spin motion-reduce:animate-none' />;

  return (
    <span
      aria-hidden='true'
      data-slot='chat-activity-spinner'
      className={cn('relative inline-flex size-3 shrink-0', className)}
    >
      <Suspense fallback={flatSpinner}>
        <MetalMorphLoaderLazy
          className='pointer-events-none absolute top-1/2 left-1/2 size-6 -translate-1/2'
          quality={spinnerQuality}
          speed={2}
          supersample={2}
          poolKey={chatSpinnerPoolKey}
          semantic='presentation'
          fallback={flatSpinner}
        />
      </Suspense>
    </span>
  );
}
