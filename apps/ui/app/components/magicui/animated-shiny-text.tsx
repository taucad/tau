import type { ComponentPropsWithoutRef, JSX } from 'react';
import { cn } from '@/utils/ui.js';

export type AnimatedShinyTextProps = {
  readonly shimmerWidth?: number;
} & ComponentPropsWithoutRef<'span'>;

export function AnimatedShinyText({ children, className, ...props }: AnimatedShinyTextProps): JSX.Element {
  return (
    <span
      className={cn(
        'max-w-md text-neutral/70',

        // Shine effect
        'animate-shiny-text [background-size:170%_100%] bg-clip-text bg-repeat',

        // Shine gradient
        'bg-gradient-to-r from-neutral/10 via-foreground via-25% to-neutral/10 to-50%',

        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
