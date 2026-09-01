import { Toaster as Sonner, toast as sonnerToast } from 'sonner';
import type { ToasterProps } from 'sonner';

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
function Toaster({ theme = 'system', ...properties }: ToasterProps): React.JSX.Element {
  return (
    <Sonner
      theme={theme}
      className='toaster group'
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:[--border-radius:var(--radius-lg)] group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
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
