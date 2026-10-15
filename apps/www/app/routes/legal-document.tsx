import { Link, useLoaderData } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { kicker } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadLegalDocument } from '#app/legal.server.js';
export const loader: typeof loadLegalDocument = loadLegalDocument;

/** Reopens the site-wide consent panel; the client enhancement enables it. */
const CookiePreferences = (): React.JSX.Element => (
  <aside className='cell legal-preferences' aria-label='Cookie preferences'>
    <p>
      Your analytics choice applies to this website and the Tau web app, where Help → Cookie preferences changes it too.
    </p>
    <Button variant='outline' data-consent-open disabled>
      Manage cookie preferences
    </Button>
    <noscript>Enable JavaScript to change this preference, or clear this site’s data in your browser.</noscript>
  </aside>
);

export default function LegalDocument(): React.JSX.Element {
  const { path, heading, html } = useLoaderData<typeof loader>();
  return (
    <MarketingPage>
      <section className='band'>
        <header className='cell page-intro'>
          <div>
            {kicker('Legal')}
            <h1>{heading}</h1>
          </div>
          <p>
            <Link className='text-link' to='/legal/' prefetch='intent'>
              All legal documents
            </Link>
          </p>
        </header>
        {path === '/legal/cookies/' ? <CookiePreferences /> : null}
        <article
          className='cell legal prose'
          // oxlint-disable-next-line react/no-danger -- Server-rendered from the repository's own legal Markdown; raw HTML in the source is dropped.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </section>
    </MarketingPage>
  );
}
