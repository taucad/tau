import { cn } from '#utils/ui.js';
import type { DocsLayoutProps } from 'fumadocs-ui/layouts/docs';
import { DocsSidebar } from '#routes/docs.$/docs-sidebar.js';

export function baseOptions(): Omit<DocsLayoutProps, 'tree'> {
  return {
    nav: {
      enabled: false,
    },
    themeSwitch: {
      enabled: false,
    },
    sidebar: {
      enabled: true,
      component: (
        <DocsSidebar
          className={cn(
            // Left
            'left-2',
            'md:left-(--sidebar-width-current)',
            'data-[state=closed]:bg-muted',
            // Top
            'top-(--header-height)',

            // Transition
            'transition-[top,left,width] duration-200 ease-linear',

            // Max width
            'max-w-[calc(100dvw-var(--spacing)*4)]',
            'md:max-w-(--docs-sidebar-width)',
            'fixed', // Following Fumadoc default
          )}
        />
      ),
    },
    containerProps: {
      className: cn(
        // Transition
        'transition-[padding] duration-200 ease-linear',
        // Positional CSS vars
        '[--fd-tocnav-height:calc(var(--header-height)+var(--spacing)*2)]!',
        // Set the sidebar width to account for both the app sidebar and the docs sidebar.
        'md:[--fd-sidebar-width:calc(var(--sidebar-width-current)+var(--docs-sidebar-width-current))]!',
        // Always account for the docs sidebar width on desktop to ensure the page doesn't shift on docs sidebar open/close.
        'xl:[--fd-sidebar-width:calc(var(--sidebar-width-current)+var(--docs-sidebar-width))]!',

        // Mobile ToC Navigation Styles
        '[&_#nd-tocnav]:border',
        '[&_#nd-tocnav]:rounded-md',
        '[&_#nd-tocnav]:bg-muted',
        '[&_#nd-tocnav]:mx-2',
        // We want to keep the full page width on mobile, but only shrink the tocnav width via margins.
        '[&_#nd-tocnav]:ml-[calc(var(--docs-sidebar-toggle-width-current)+var(--spacing)*4)]',
        'md:[&_#nd-tocnav]:ml-[calc(var(--docs-sidebar-toggle-width-current)+var(--spacing)*2)]',
        '[&_#nd-tocnav]:mt-(--header-height)!',
        '[&_#nd-tocnav]:transition-[top,left,width] [&_#nd-tocnav]:duration-200 [&_#nd-tocnav]:ease-linear',
        '[&_#nd-tocnav]:shadow-sm',
        '[&_#nd-tocnav>button]:px-2',
        '[&_#nd-tocnav>button]:h-7.5',
        
        // Desktop ToC Styles
        'xl:[--fd-toc-width:var(--docs-sidebar-width)]!',
        'xl:[--fd-banner-height:calc(var(--header-height)-(var(--spacing)*2))]',
        '[&_#nd-toc]:border',
        '[&_#nd-toc]:rounded-md',
        '[&_#nd-toc]:bg-muted',
        '[&_#nd-toc]:m-2',
        '[&_#nd-toc]:p-2',
        '[&_#nd-toc]:w-(--docs-sidebar-width)',
        '[&_#nd-toc]:h-fit',
        '[&_#nd-toc]:ms-2',
        '[&_#nd-toc]:end-0!'
      ),
    }
  };
}
