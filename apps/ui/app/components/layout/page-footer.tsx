import { useState } from 'react';
import { Link } from 'react-router';
import { Tau } from '#components/icons/tau.js';
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { metaConfig } from '#constants/meta.constants.js';
import { CookiePreferencesDialog } from '#components/cookie-consent.js';

const navigationLinks = [
  { label: 'Home', href: '/' },
  { label: 'Docs', href: 'https://docs.tau.new' },
  { label: 'Legal', href: '/legal' },
];

type FooterColumn = {
  readonly heading: string;
  readonly links: ReadonlyArray<{ readonly label: string; readonly to: string }>;
};

const footerColumns: FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Docs', to: 'https://docs.tau.new' },
      { label: 'Community', to: '/community' },
      { label: 'Convert', to: '/convert' },
      { label: 'Import', to: '/import' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms', to: '/legal/terms' },
      { label: 'Privacy', to: '/legal/privacy' },
      { label: 'Acceptable use', to: '/legal/acceptable-use' },
    ],
  },
];

/**
 * Page footer. `variant='compact'` (default) is the single-row footer used
 * across app routes; `variant='full'` is the multi-column marketing footer with
 * product/legal columns, socials, and the app version.
 */
export function PageFooter({ variant = 'compact' }: { readonly variant?: 'compact' | 'full' }): React.JSX.Element {
  const [isCookieDialogOpen, setIsCookieDialogOpen] = useState(false);

  if (variant === 'full') {
    return (
      <footer className='shrink-0 border-t border-neutral/20 bg-background'>
        <div className='container mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-4'>
          <div className='space-y-3'>
            <Link to='/' className='inline-flex' aria-label='Tau home'>
              <TauWordmark className='h-6 w-auto text-primary' />
            </Link>
            <p className='max-w-[28ch] text-sm text-muted-foreground'>{metaConfig.description}</p>
            <div className='flex items-center gap-2 pt-1'>
              <a
                href={metaConfig.githubUrl}
                target='_blank'
                rel='noopener noreferrer'
                aria-label='Tau on GitHub'
                className='text-muted-foreground transition-colors hover:text-foreground'
              >
                <SvgIcon id='github' className='size-5' />
              </a>
              <a
                href={metaConfig.discordUrl}
                target='_blank'
                rel='noopener noreferrer'
                aria-label='Tau on Discord'
                className='text-muted-foreground transition-colors hover:text-foreground'
              >
                <SvgIcon id='discord' className='size-5' />
              </a>
            </div>
          </div>

          {footerColumns.map((column) => (
            <div key={column.heading} className='space-y-3'>
              <h3 className='text-sm font-semibold'>{column.heading}</h3>
              <ul className='space-y-2'>
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className='text-sm text-muted-foreground transition-colors hover:text-foreground'
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className='space-y-3'>
            <h3 className='text-sm font-semibold'>Resources</h3>
            <ul className='space-y-2'>
              <li>
                <button
                  type='button'
                  className='text-sm text-muted-foreground transition-colors hover:text-foreground'
                  onClick={() => {
                    setIsCookieDialogOpen(true);
                  }}
                >
                  Cookie preferences
                </button>
              </li>
              <li>
                <a
                  href={`mailto:${metaConfig.salesEmail}`}
                  className='text-sm text-muted-foreground transition-colors hover:text-foreground'
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className='border-t'>
          <div className='container mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-xs text-muted-foreground'>
            <span>
              © {new Date().getFullYear()} {metaConfig.name}
            </span>
            <span className='font-mono'>v{metaConfig.version}</span>
          </div>
        </div>

        <CookiePreferencesDialog isOpen={isCookieDialogOpen} onOpenChange={setIsCookieDialogOpen} />
      </footer>
    );
  }

  return (
    <footer className='shrink-0 border-t border-neutral/20 bg-background'>
      <div className='container mx-auto flex h-10 max-w-6xl items-center justify-between px-4'>
        <div className='flex items-center gap-6'>
          <Link to='/' className='text-foreground transition-colors hover:text-foreground/80'>
            <Tau className='size-5 text-primary' />
          </Link>
          <nav className='flex items-center gap-4'>
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className='text-sm text-muted-foreground transition-colors hover:text-foreground'
              >
                {link.label}
              </Link>
            ))}
            <button
              type='button'
              className='text-sm text-muted-foreground transition-colors hover:text-foreground'
              onClick={() => {
                setIsCookieDialogOpen(true);
              }}
            >
              Cookies
            </button>
            <a
              href={`mailto:${metaConfig.salesEmail}`}
              className='text-sm text-muted-foreground transition-colors hover:text-foreground'
            >
              Contact
            </a>
          </nav>
        </div>
      </div>

      <CookiePreferencesDialog isOpen={isCookieDialogOpen} onOpenChange={setIsCookieDialogOpen} />
    </footer>
  );
}
