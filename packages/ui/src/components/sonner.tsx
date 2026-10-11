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
      className={cn('toaster group font-sans!', className)}
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
            'group toast flex w-full flex-wrap items-center gap-2 p-3 text-sm transition-[transform,opacity]! duration-200! focus-visible:focus-outline focus-visible:shadow-none! has-[[data-close-button]]:pe-10',
          ),
          title: 'font-medium leading-5',
          description: 'text-muted-foreground! font-normal leading-5',
          content: 'w-full min-w-0 group-has-[[data-icon]]:ps-6',
          icon: 'absolute start-3 top-3 flex size-5 items-center justify-center',
          actionButton: cn(
            buttonVariants({ size: 'sm' }),
            'ms-auto h-auto min-h-8 max-w-full whitespace-normal group-has-[[data-cancel]]:ms-0',
          ),
          cancelButton: cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'ms-auto h-auto min-h-8 max-w-full whitespace-normal',
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
