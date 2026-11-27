import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@taucad/ui/utils/cn';

export type AnimatedShinyTextProps = {
  readonly shimmerWidth?: number;
} & ComponentPropsWithoutRef<'span'>;

export function AnimatedShinyText({ children, className, ...props }: AnimatedShinyTextProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'max-w-md text-neutral/80',

        // Work in flight breathes on opacity alone, which the compositor runs without the main thread.
        'animate-shiny-text motion-reduce:animate-none',

        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
