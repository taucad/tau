import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { TauThemeSwitch } from '#components/theme-switch.js';

const TauDocsTitle = (): React.JSX.Element => (
  <span className='inline-flex items-center gap-2 font-mono text-sm font-semibold tracking-wide'>
    <span aria-hidden className='text-fd-primary'>
      τ
    </span>
    <span>TAU</span>
    <span className='text-muted-foreground'>/ DOCS</span>
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
  ],
  githubUrl: 'https://github.com/taucad/tau',
  searchToggle: { enabled: true },
  themeSwitch: { enabled: true },
  slots: { themeSwitch: TauThemeSwitch },
});
