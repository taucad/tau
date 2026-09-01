import { Link, NavLink } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { metaConfig } from '#constants/meta.constants.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { GithubStarButton } from '#components/marketing/github-star-button.js';

const navLinks = [
  { label: 'Docs', to: 'https://docs.tau.new' },
  { label: 'Community', to: '/community' },
];

/**
 * Marketing top navigation for signed-out visitors. Replaces the app sidebar
 * chrome on the home route when the viewer is anonymous (see `Page` +
 * `Handle.enablePageWrapper`).
 */
export function MarketingTopNav(): React.JSX.Element {
  const { signIn } = useAuthLinks();

  return (
    <header className='sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md'>
      <div className='container mx-auto flex h-14 items-center justify-between gap-4 px-4'>
        <div className='flex items-center gap-6'>
          <Link to='/' className='flex items-center' aria-label='Tau home'>
            <TauWordmark className='h-6 w-auto text-primary' />
          </Link>
          <nav className='hidden items-center gap-1 md:flex'>
            {navLinks.map((link) => (
              <Button key={link.to} asChild variant='ghost' size='sm'>
                <Link to={link.to}>{link.label}</Link>
              </Button>
            ))}
          </nav>
        </div>

        <div className='flex items-center gap-1 sm:gap-2'>
          <GithubStarButton />
          <Button asChild variant='ghost' size='icon' className='hidden sm:inline-flex' aria-label='Join our Discord'>
            <a href={metaConfig.discordUrl} target='_blank' rel='noopener noreferrer'>
              <SvgIcon id='discord' className='size-4' />
            </a>
          </Button>
          <Button asChild variant='ghost' size='sm'>
            <NavLink to={signIn}>Sign in</NavLink>
          </Button>
          <Button asChild size='sm'>
            <a href='#start-building'>Start building</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
