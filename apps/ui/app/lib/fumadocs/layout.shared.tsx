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
            'left-(--sidebar-width-current)',
            'top-(--header-height)',
            'transition-all duration-200 ease-linear',
            'max-w-[calc(var(--sidebar-width)-(var(--spacing)*2))]',
            'fixed'
          )}
        />
      ),
    },
    'containerProps': {
      className: cn(
        // Positional CSS vars
        'md:[--fd-sidebar-width:var(--sidebar-width)]!',
        'md:[--fd-banner-height:calc(var(--header-height)-(var(--spacing)*2))]',
        
        // Mobile ToC Navigation Styles
        '[&_#nd-tocnav]:border [&_#nd-tocnav]:rounded-md [&_#nd-tocnav]:bg-sidebar',
        '[&_#nd-tocnav]:mx-2 [&_#nd-tocnav]:mt-2',
        '[&_#nd-tocnav>button]:px-2 [&_#nd-tocnav>button]:h-7.5',

        // Desktop ToC Styles
        '[&_#nd-toc]:border [&_#nd-toc]:rounded-md [&_#nd-toc]:bg-sidebar [&_#nd-toc]:m-2 [&_#nd-toc]:p-2',
        '[&_#nd-toc]:w-(--sidebar-width) [&_#nd-toc]:h-fit',
      ),
    }
  };
}
