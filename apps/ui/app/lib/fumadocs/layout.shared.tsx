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
            // Top
            'top-(--header-height)',

            // Transition
            'transition-all duration-200 ease-linear',

            // Max width
            'max-w-[calc(100dvw-var(--spacing)*4)]',
            'md:max-w-(--sidebar-width)',
            'fixed', // Following Fumadoc default
          )}
        />
      ),
    },
    containerProps: {
      className: cn(
        'transition-all duration-200 ease-linear',
        // Positional CSS vars
        '[--fd-tocnav-height:calc(var(--header-height)+var(--spacing)*2)]!',
        // Only apply sidebar width on dekstop
        'md:[--fd-sidebar-width:calc(var(--sidebar-width-current)+var(--docs-sidebar-width-current))]!',
        'xl:[--fd-sidebar-width:calc(var(--sidebar-width-current)+var(--docs-sidebar-width))]!',

        // Mobile ToC Navigation Styles
        '[&_#nd-tocnav]:border',
        '[&_#nd-tocnav]:rounded-md',
        '[&_#nd-tocnav]:bg-sidebar',
        '[&_#nd-tocnav]:mx-2',
        // We want to keep the full page width on mobile, but only shrink the tocnav width via margins.
        '[&_#nd-tocnav]:ml-[calc(var(--docs-sidebar-toggle-width-current)+var(--spacing)*4)]',
        'md:[&_#nd-tocnav]:ml-[calc(var(--docs-sidebar-toggle-width-current)+var(--spacing)*2)]',
        // 'md:[&_#nd-tocnav]:ml-(--docs-sidebar-toggle-width-current)',
        '[&_#nd-tocnav]:mt-(--header-height)!',
        '[&_#nd-tocnav]:transition-all [&_#nd-tocnav]:duration-200 [&_#nd-tocnav]:ease-linear',
        '[&_#nd-tocnav>button]:px-2',
        '[&_#nd-tocnav>button]:h-7.5',
        
        // Desktop ToC Styles
        'md:[--fd-toc-width:var(--sidebar-width)]!',
        'xl:[--fd-banner-height:calc(var(--header-height)-(var(--spacing)*2))]',
        '[&_#nd-toc]:border',
        '[&_#nd-toc]:rounded-md',
        '[&_#nd-toc]:bg-sidebar',
        '[&_#nd-toc]:m-2',
        '[&_#nd-toc]:p-2',
        '[&_#nd-toc]:w-(--sidebar-width)',
        '[&_#nd-toc]:h-fit',
        '[&_#nd-toc]:ms-2',
        '[&_#nd-toc]:end-0!'
      ),
    }
  };
}
