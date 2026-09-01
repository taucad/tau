import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@taucad/ui/utils/cn';

export type AnimatedGradientTextProps = {
  readonly speed?: number;
  readonly colorFrom?: string;
  readonly colorTo?: string;
} & ComponentPropsWithoutRef<'div'>;

export function AnimatedGradientText({
  children,
  className,
  speed = 1,
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- decorative default
  colorFrom = '#ffaa40',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- decorative default
  colorTo = '#9c40ff',
  ...props
}: AnimatedGradientTextProps): React.JSX.Element {
  return (
    <span
      style={
        {
          '--bg-size': `${speed * 300}%`,
          '--color-from': colorFrom,
          '--color-to': colorTo,
        } as React.CSSProperties
      }
      className={cn(
        `inline animate-gradient bg-gradient-to-r from-[var(--color-from)] via-[var(--color-to)] to-[var(--color-from)] bg-[length:var(--bg-size)_100%] bg-clip-text text-transparent`,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
