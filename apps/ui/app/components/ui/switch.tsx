import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/ui.js';

const switchVariants = cva(
  'peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        // Sizes are slightly larger than thumb to present an elegant, thin appearance
        sm: 'h-3.15 w-6',
        md: 'h-4.15 w-8',
        lg: 'h-5.15 w-10',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

const thumbVariants = cva(
  'bg-background dark:data-[state=checked]:bg-background pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0',
  {
    variants: {
      size: {
        sm: 'size-3',
        md: 'size-4',
        lg: 'size-5',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

function Switch({
  className,
  size,
  ...properties
}: React.ComponentProps<typeof SwitchPrimitive.Root> & VariantProps<typeof switchVariants>) {
  return (
    <SwitchPrimitive.Root data-slot="switch" className={cn(switchVariants({ size, className }))} {...properties}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className={cn(thumbVariants({ size }))} />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
