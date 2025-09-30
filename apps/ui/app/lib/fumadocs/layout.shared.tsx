import { cn, cni } from '#utils/ui.js';
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
            // 'top-[calc(var(--header-height)*2-var(--spacing)*2)]',
            'top-(--header-height)',

            // Transition
            'transition-all duration-200 ease-linear',

            // Max width
            'max-w-[calc(var(--sidebar-width)-(var(--spacing)*2))]',
            'fixed', // Following Fumadoc default
          )}
        />
      ),
    },
    containerProps: {
      className: cn(
        // Positional CSS vars
        'md:[--fd-sidebar-width:var(--sidebar-width)]!',

        // Mobile ToC Navigation Styles
        cni('[&_#nd-tocnav]', [
          'border',
          'rounded-md',
          'bg-sidebar',
          'mx-2',
          'mt-(--header-height)!',
          'ml-4',
        ]),
        cni('[&_#nd-tocnav>button]', [
          'px-2',
          'h-7.5',
        ]),

        // Desktop ToC Styles
        'md:[--fd-toc-width:var(--sidebar-width)]!',
        'xl:[--fd-banner-height:calc(var(--header-height)-(var(--spacing)*2))]',
        cni('[&_#nd-toc]', [
          'border',
          'rounded-md', 
          'bg-sidebar',
          'm-2',
          'p-2',
          'w-(--sidebar-width)',
          'h-fit',
          'ms-2',
          'end-0!'
        ]),
      ),
    }
  };
}
