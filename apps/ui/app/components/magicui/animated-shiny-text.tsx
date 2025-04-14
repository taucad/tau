import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/utils/ui.js';

export type AnimatedShinyTextProps = {
  readonly shimmerWidth?: number;
} & ComponentPropsWithoutRef<'span'>;

export function AnimatedShinyText({ children, className, shimmerWidth = 200, ...props }: AnimatedShinyTextProps) {
  return (
    <span
      style={{
        '--shiny-width': `${shimmerWidth}px`,
      }}
      className={cn(
        'mx-auto max-w-md text-neutral/70',

        // Shine effect
        'animate-shiny-text [background-size:var(--shiny-width)_100%] bg-clip-text [background-position:0_0] bg-no-repeat [transition:background-position_1s_cubic-bezier(0,1)_infinite]',

        // Shine gradient
        'bg-gradient-to-r from-transparent via-black/80 via-50% to-transparent dark:via-white/80',

        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
