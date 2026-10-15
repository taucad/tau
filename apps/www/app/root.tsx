import { useEffect, useRef } from 'react';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
  useLocation,
  useNavigation,
  Link,
  isRouteErrorResponse,
} from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { navigation, sourceUrl, discordUrl } from '#www/content.js';
import { wordmark } from '#www/wordmark.js';
import { bootEntry } from '#www/entry.js';
import { randomUuid } from '@taucad/utils/id';
import type { LinksFunction } from 'react-router';
import type { SiteConfiguration } from '#app/config.server.js';
import { siteConfiguration } from '#app/config.server.js';
import type { Route } from './+types/root.js';
import siteCss from '#www/site.css?inline';
import { appOrigin } from '#www/environment.js';

export function loader(): SiteConfiguration & { nonce: string } {
  return { ...siteConfiguration(), nonce: randomUuid() };
}

// Site configuration and CSP nonce belong to the initial document.
export function shouldRevalidate(): boolean {
  return false;
}

export const links: LinksFunction = () => {
  return [
    { rel: 'icon', href: '/_www/assets/favicon.svg', type: 'image/svg+xml' },
    {
      rel: 'preload',
      href: '/_www/assets/geist-latin.woff2',
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous',
    },
  ];
};

const boot = `document.documentElement.classList.add('js');document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches);(${bootEntry.toString()})();`;

function Brand() {
  return (
    <Link to='/' aria-label='Tau home' className='wordmark' prefetch='intent'>
      <svg viewBox={wordmark.viewBox} aria-hidden='true'>
        <path className='wordmark-symbol' fillRule='evenodd' d={wordmark.symbol} />
        <path fillRule='evenodd' d={wordmark.letters} />
      </svg>
    </Link>
  );
}

function Navigation({ label }: { label: string }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label={label}>
      {navigation.map(([name, href]) => (
        <Link
          key={href}
          to={href}
          prefetch='intent'
          aria-current={pathname.replace(/\/$/u, '') === href.replace(/\/$/u, '') ? 'page' : undefined}
        >
          {name}
        </Link>
      ))}
      <a href='https://docs.tau.new/'>Docs ↗</a>
      {label === 'Mobile navigation' ? <a href={`${appOrigin}/auth/sign-in`}>Sign in ↗</a> : null}
    </nav>
  );
}

function SiteShell() {
  const { pathname } = useLocation();
  const navigationState = useNavigation();
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      document.querySelector<HTMLElement>('#main')?.focus({ preventScroll: true });
      document.querySelector<HTMLDetailsElement>('.mobile-menu')?.removeAttribute('open');
      previousPath.current = pathname;
    }
  }, [pathname]);
  useEffect(() => {
    const controller = new AbortController();
    let cleanup: (() => void) | undefined;
    async function initialize() {
      const { initializePage } = await import('#www/client.client.js');
      if (!controller.signal.aborted) {
        cleanup = initializePage(controller.signal);
      }
    }
    // async-iife: bootstrap -- The effect owns cancellation and cleanup of the browser enhancement.
    void initialize();
    return () => {
      controller.abort();
      cleanup?.();
    };
  }, [pathname]);
  return (
    <>
      <a className='skip' href='#main'>
        Skip to content
      </a>
      <header className='site-header'>
        <div className='header-inner'>
          <Brand />
          <div className='primary-nav'>
            <Navigation label='Main navigation' />
          </div>
          <div className='header-actions'>
            <a className='signin' href={`${appOrigin}/auth/sign-in`}>
              Sign in
            </a>
            <Button asChild size='sm'>
              <a href='https://tau.new/projects/new' data-event='cta' data-placement='header'>
                Start designing ↗
              </a>
            </Button>
            <details className='mobile-menu'>
              <summary aria-label='Menu'>
                <span className='bars' aria-hidden='true' />
                <span className='menu-label'>Menu</span>
              </summary>
              <Navigation label='Mobile navigation' />
            </details>
          </div>
        </div>
      </header>
      <div role='status' className='sr-only'>
        {navigationState.state === 'idle' ? '' : 'Loading page…'}
      </div>
      <main id='main' className='frame' tabIndex={-1}>
        <Outlet />
      </main>
      <footer className='site-footer frame'>
        <div className='band footer-grid'>
          <div className='cell footer-brand'>
            <Brand />
            <p>Design Verify Make.</p>
            <p className='fine'>Open-source CAD for the things you want to make.</p>
          </div>
          <nav className='cell' aria-label='Product'>
            <h2>Product</h2>
            <Link to='/product/' prefetch='intent'>
              Workspace
            </Link>
            <Link to='/use-cases/' prefetch='intent'>
              Use cases
            </Link>
            <Link to='/pricing/' prefetch='intent'>
              Pricing
            </Link>
            <Link to='/download/' prefetch='intent'>
              Get Tau
            </Link>
          </nav>
          <nav className='cell' aria-label='Company'>
            <h2>Company</h2>
            <Link to='/vision/'>Vision</Link>
            <Link to='/blog/'>Blog</Link>
            <Link to='/contact/'>Contact</Link>
          </nav>
          <nav className='cell' aria-label='Resources'>
            <h2>Resources</h2>
            <a href='https://docs.tau.new/'>Documentation ↗</a>
            <a href={sourceUrl}>GitHub ↗</a>
            <a href={discordUrl}>Discord ↗</a>
          </nav>
          <nav className='cell' aria-label='Legal'>
            <h2>Legal</h2>
            <Link to='/privacy/'>Site privacy</Link>
            <a href='https://tau.new/legal/privacy'>App privacy ↗</a>
            <a href='https://tau.new/legal/terms'>Terms ↗</a>
            <a href='/_www/assets/THIRD_PARTY_LICENSES.txt'>Licenses</a>
          </nav>
        </div>
        <div className='band footer-bottom'>
          <span className='cell'>© 2026 Tau · Apache-2.0</span>
          <Button variant='ghost' data-consent-open hidden>
            Analytics preferences
          </Button>
        </div>
      </footer>
      <aside className='consent' aria-label='Optional analytics' hidden>
        <p>
          <strong>Help us understand what’s useful?</strong>
          <br />
          Allow basic page and action counts. No session replay. <Link to='/privacy/'>Privacy details</Link>
        </p>
        <div className='actions'>
          <Button variant='outline' data-consent='denied'>
            Continue without
          </Button>
          <Button data-consent='accepted'>Allow analytics</Button>
        </div>
      </aside>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }): React.JSX.Element {
  const configuration = useRouteLoaderData<typeof loader>('root');
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <Meta />
        <Links />
        <style nonce={configuration?.nonce}>{siteCss}</style>

        <script
          nonce={configuration?.nonce}
          // oxlint-disable-next-line react/no-danger -- Self-contained first-party bootstrap; no request data is interpolated.
          dangerouslySetInnerHTML={{ __html: boot }}
        />
      </head>
      <body data-analytics-endpoint={configuration?.analyticsEndpoint}>
        {children}
        <ScrollRestoration nonce={configuration?.nonce} />
        <Scripts nonce={configuration?.nonce} />
      </body>
    </html>
  );
}

export default function App(): React.JSX.Element {
  return <SiteShell />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps): React.JSX.Element {
  const isMissing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className='frame cell page-intro'>
      <title>{isMissing ? 'Page not found · Tau' : 'Page unavailable · Tau'}</title>
      <meta name='robots' content='noindex,nofollow' />
      <h1>{isMissing ? 'This path ends here.' : 'This page is unavailable.'}</h1>
      <p>{isMissing ? 'The link may have changed.' : 'Please try again in a moment.'}</p>
      <Button asChild>
        <a href='/'>Back to Tau</a>
      </Button>
    </main>
  );
}
