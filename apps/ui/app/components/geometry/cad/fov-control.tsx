import { useEffect } from 'react';
import { Info } from 'lucide-react';
import { Slider } from '#components/ui/slider.js';
import { buttonVariants } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { formatKeyCombination } from '#utils/keys.utils.js';

type CameraControlProps = {
  /**
   * Default field of view angle in degrees (0 = orthographic, 90 = perspective)
   */
  readonly defaultAngle: number;
  /**
   * Callback when field of view angle changes
   */
  readonly onChange?: (angle: number) => void;
  /**
   * Class name for the slider container
   */
  readonly className?: string;
};

/**
 * External UI component that provides a slider to transition between
 * orthographic (0°) and perspective (90°) camera views.
 *
 * Note: This component DOES NOT directly use Three.js hooks.
 * You must use CameraHandler inside the Canvas separately.
 */
export function FovControl({ defaultAngle, className }: Omit<CameraControlProps, 'onChange'>): React.JSX.Element {
  const [fovAngle, setFovAngle] = useCookie<number>(cookieName.fovAngle, defaultAngle);

  // Track Shift key state for changing slider step
  const { isKeyPressed: isShiftHeld } = useKeydown(
    { key: 'Shift' },
    () => {
      // No-op callback, we just use the returned isKeyPressed state
    },
    {
      preventDefault: false,
      stopPropagation: false,
    },
  );

  // Synchronize fov angle to the Graphics context when angle changes
  useEffect(() => {
    graphicsActor.send({ type: 'setFovAngle', payload: fovAngle });
  }, [fovAngle]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            buttonVariants({
              variant: 'overlay',
              size: 'sm',
              className: cn(
                'group relative gap-0 overflow-hidden p-0 transition-[box-shadow] duration-300 max-md:w-30 md:w-50',
                'flex items-center',
                'hover:cursor-pointer',
                '[&:focus-within]:border-primary',
                '[&:focus-within]:ring-ring/50',
                '[&:focus-within]:ring-3',
                className,
              ),
            }),
          )}
        >
          {/* Slider container that slides up from bottom */}
          <Slider
            min={0}
            max={90}
            step={isShiftHeld ? 5 : 1}
            value={[fovAngle]}
            variant="inset"
            // Inset-0 is used to make the entire button slideable for better UX
            className={cn(
              'size-full transition-[opacity] duration-300',
              // Mobile gets a visual clue that this is a slider
              'opacity-15 md:opacity-0',
              // Brighten the slider when hovering or focusing,
              // keeping it dim for mobile to ensure the text is legible
              'group-hover:opacity-30 focus-within:opacity-30',
              '[&_[data-slot=slider-track]]:h-full',
              '[&_[data-slot=slider-track]]:rounded-none',
              '[&_[data-slot=slider-track]]:border-none',
              '[&_[data-slot=slider-track]]:bg-transparent',
              '[&_[data-slot=slider-track]]:ring-0',
            )}
            onValueChange={(value) => {
              setFovAngle(value[0]!);
            }}
          />
          {/* Text labels that will move up on hover */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0 flex h-full w-full items-center justify-between gap-1 px-2',
              'text-xs leading-none text-foreground transition-all duration-300 select-none',
            )}
          >
            <span className="hidden md:block">Orthographic</span>
            <span className="md:hidden">Orth.</span>
            <div className="w-[3ch] text-center font-bold">{fovAngle}°</div>
            <span className="hidden md:block">Perspective</span>
            <span className="md:hidden">Persp.</span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent forceMount>
        <span>Change field of view angle</span>
        <br />
        <span className="inline-flex items-center gap-1 text-neutral-foreground/60 dark:text-foreground/50">
          <Info className="size-3 stroke-2" /> Set to 0° for orthographic view
        </span>
        {/* Desktop only - shift key is usually not available on mobile */}
        <br className="max-md:hidden" />
        <span className="inline-flex items-center gap-1 text-neutral-foreground/60 max-md:hidden dark:text-foreground/50">
          <Info className="size-3 stroke-2" /> Hold{' '}
          <KeyShortcut variant="tooltip">{formatKeyCombination({ key: 'Shift' })}</KeyShortcut> for 5° steps
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
