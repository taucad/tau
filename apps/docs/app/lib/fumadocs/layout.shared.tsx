import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { resolveLinkItems } from 'fumadocs-ui/layouts/shared';
import { TauThemeSwitch } from '#components/theme-switch.js';
import { TauWordmark } from '#components/tau-wordmark.js';

const TauDocsTitle = (): React.JSX.Element => (
  <span className='inline-flex items-center gap-2.5'>
    <TauWordmark aria-hidden className='h-5 w-auto text-fd-foreground' />
    <span className='sr-only'>Tau</span>
    <span className='font-mono text-sm font-semibold tracking-wide text-muted-foreground'>DOCS</span>
  </span>
);

export const baseOptions = (): BaseLayoutProps => ({
  nav: {
    title: <TauDocsTitle />,
    url: '/',
    transparentMode: 'none',
  },
  links: [
    { text: 'Runtime', url: '/runtime' },
    { text: 'Editor', url: '/editor' },
    ...resolveLinkItems({ githubUrl: 'https://github.com/taucad/tau' }).map((link) =>
      link.type === 'icon' ? { ...link, icon: <span aria-hidden>{link.icon}</span> } : link,
    ),
  ],
  searchToggle: { enabled: true },
  themeSwitch: { enabled: true },
  slots: { themeSwitch: TauThemeSwitch },
});
