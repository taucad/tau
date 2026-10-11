import { Toaster as Sonner, toast as sonnerToast } from 'sonner';
import type { ToasterProps } from 'sonner';
import { Check, CircleAlert, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { buttonVariants } from '#components/button.js';
import { popoverSurfaceVariants } from '#components/popover.variants.js';
import { cn } from '#utils/cn.js';

/**
 * Render Sonner's live-region toaster with Tau surface tokens. The caller owns
 * theme state; the default follows the operating system.
 *
 * @public
 * @param properties - Sonner toaster properties, including the active theme.
 * @returns The configured toaster.
 *
 * @example <caption>Mount the toaster</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Toaster } from '@taucad/ui/components/sonner';
 *
 * export const example = createElement(Toaster, { theme: 'dark' });
 * ```
 */
function Toaster({ theme = 'system', className, toastOptions, icons, ...properties }: ToasterProps): React.JSX.Element {
  return (
    <Sonner
      theme={theme}
      closeButton
      duration={7000}
      className={cn('toaster group @container/toaster font-sans!', className)}
      icons={{
        success: <Check aria-hidden className='size-4' />,
        info: <Info aria-hidden className='size-4 text-information' />,
        warning: <TriangleAlert aria-hidden className='size-4 text-warning' />,
        error: <CircleAlert aria-hidden className='size-4 text-feature' />,
        loading: <LoaderCircle aria-hidden className='size-4 animate-spin motion-reduce:animate-none' />,
        close: <X aria-hidden className='size-3' />,
        ...icons,
      }}
      toastOptions={{
        unstyled: true,
        ...toastOptions,
        classNames: {
          toast: cn(
            popoverSurfaceVariants(),
            'group toast flex max-h-[calc(100dvh-4rem)] w-full touch-pan-y! flex-wrap items-start gap-2 overflow-y-auto p-3 text-sm transition-[transform,opacity]! duration-200! focus-visible:focus-outline focus-visible:shadow-none! has-[[data-close-button]]:pe-10 has-[[data-icon]]:ps-9 @max-[18rem]/toaster:has-[[data-close-button]]:pe-3 @max-[18rem]/toaster:has-[[data-icon]]:ps-3',
          ),
          title: 'font-medium leading-5',
          description: 'text-muted-foreground! font-normal leading-5',
          content:
            'min-w-0 flex-1 basis-40 wrap-anywhere group-has-[[data-cancel]]:basis-full @max-[18rem]/toaster:basis-full @max-[18rem]/toaster:group-has-[[data-close-button]]:pt-8 @max-[18rem]/toaster:group-has-[[data-icon]]:pt-8',
          icon: 'absolute start-3 top-3 flex size-5 items-center justify-center',
          actionButton: cn(buttonVariants({ size: 'sm' }), 'h-auto min-h-8 max-w-full wrap-anywhere whitespace-normal'),
          cancelButton: cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'h-auto min-h-8 max-w-full wrap-anywhere whitespace-normal',
          ),
          closeButton: cn(
            buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
            'absolute end-2 top-2 bg-transparent! text-popover-foreground! hover:bg-accent/50! dark:hover:bg-accent/80!',
          ),
          ...toastOptions?.classNames,
        },
      }}
      {...properties}
    />
  );
}

export { Toaster };

/**
 * Queue a toast for the nearest mounted {@link Toaster}.
 *
 * @public
 *
 * @example <caption>Announce a saved change</caption>
 * ```typescript
 * import { toast } from '@taucad/ui/components/sonner';
 *
 * toast.success('Saved');
 * ```
 */
const toast: typeof sonnerToast = sonnerToast;

export { toast };
