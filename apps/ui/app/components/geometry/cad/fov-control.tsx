import { Info } from 'lucide-react';
import { Slider } from '#components/ui/slider.js';
import { buttonVariants } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useModifiers } from '#hooks/use-keyboard.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { useCameraRig, useCameraSelector } from '#hooks/use-graphics.js';

const shiftKey = formatKeyCombination({ key: 'Shift' });

type FovControlProps = {
  /**
   * Class name for the slider container (used to set width)
   */
  readonly className?: string;
  /**
   * When true, shows abbreviated labels (Orth. / Persp.) instead of full text.
   * Controlled by the parent toolbar overflow system.
   */
  readonly isCompact?: boolean;
};

/**
 * External UI component that provides a slider to transition between
 * orthographic (0deg) and perspective (90deg) camera views.
 *
 * Reads the current FOV from the per-view portable camera actor.
 */
export function FovControl({ className, isCompact = false }: FovControlProps): React.JSX.Element {
  const cameraRig = useCameraRig();
  const fovAngle = useCameraSelector((state) => state.context.view.requestedVerticalFieldOfView);

  // Track Shift key state for changing slider step
  const { shift: isShiftHeld } = useModifiers();

  const handleFovChange = (value: number[]): void => {
    cameraRig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: value[0]! });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            buttonVariants({
              variant: 'overlay',
              size: 'sm',
              className: cn(
                'group relative gap-0 overflow-hidden p-0 transition-[box-shadow] duration-300',
                'flex items-center',
                'hover:cursor-pointer',
                'has-[[data-slot=slider-thumb]:focus-visible]:ring-2',
                'has-[[data-slot=slider-thumb]:focus-visible]:ring-ring',
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
            variant='inset'
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
            onValueChange={handleFovChange}
          />
          {/* Text labels that will move up on hover */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0 flex h-full w-full items-center justify-between gap-1 px-2',
              'text-xs leading-none text-foreground transition-all duration-300 select-none',
            )}
          >
            <span>{isCompact ? 'Orth.' : 'Orthographic'}</span>
            <div className='w-[3ch] text-center font-bold'>{fovAngle}&deg;</div>
            <span>{isCompact ? 'Persp.' : 'Perspective'}</span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent forceMount>
        <span>Change field of view angle</span>
        <br />
        <span className='inline-flex items-center gap-1 text-neutral-foreground/60 dark:text-foreground/50'>
          <Info className='size-3 stroke-2' /> Set to 0&deg; for orthographic view
        </span>
        {/* Desktop only - shift key is usually not available on mobile */}
        <br className='max-md:hidden' />
        <span className='inline-flex items-center gap-1 text-neutral-foreground/60 max-md:hidden dark:text-foreground/50'>
          <Info className='size-3 stroke-2' />{' '}
          {isShiftHeld ? (
            <>
              Release <KeyShortcut variant='tooltip'>{shiftKey}</KeyShortcut> for 1&deg; steps
            </>
          ) : (
            <>
              Hold <KeyShortcut variant='tooltip'>{shiftKey}</KeyShortcut> for 5&deg; steps
            </>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
