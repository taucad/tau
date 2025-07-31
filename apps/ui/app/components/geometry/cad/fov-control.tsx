import { useEffect } from 'react';
import { Slider } from '#components/ui/slider.js';
import { buttonVariants } from '#components/ui/button.js';
import { cn } from '#utils/ui.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

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
            }),
            className,
            'group relative w-fit gap-0 overflow-hidden p-0 hover:overflow-visible max-md:overflow-visible',
            'flex items-center',
            'hover:cursor-pointer',
          )}
        >
          {/* Text labels that will move up on hover */}
          <div className="flex w-full justify-between gap-2 px-1 text-xs leading-none transition-transform duration-300 group-hover:-translate-y-1.75 max-md:-translate-y-1.75">
            <span className="hidden md:block">Orthographic</span>
            <span className="md:hidden">Orth.</span>
            <div className="w-[3ch] text-center font-bold text-primary">{fovAngle}°</div>
            <span className="hidden md:block">Perspective</span>
            <span className="md:hidden">Persp.</span>
          </div>

          {/* Slider container that slides up from bottom */}
          <Slider
            min={0}
            max={90}
            step={1}
            value={[fovAngle]}
            // Inset-0 is used to make the entire button slideable for better UX
            className="absolute inset-0 h-full px-1 pt-8 opacity-0 duration-300 group-hover:pt-4 group-hover:opacity-100 max-md:pt-4 max-md:opacity-100 [&_[data-slot='slider-track']]:bg-neutral/20"
            onValueChange={(value) => {
              setFovAngle(value[0]!);
            }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <span>Adjust field of view angle</span>
        <br />
        <span className="text-neutral-foreground/60 dark:text-foreground/50">Tip: Set to 0° for orthographic view</span>
      </TooltipContent>
    </Tooltip>
  );
}
