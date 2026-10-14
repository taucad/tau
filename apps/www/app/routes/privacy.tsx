import { Button } from '@taucad/ui/components/button';
import { SiteLink } from '#www/site-link.js';
import { appOrigin } from '#www/environment.js';
import { out, intro } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <section className='band'>
    {intro({
      eyebrow: 'Marketing site',
      title: (
        <>
          Privacy, with
          <br />
          clear choices.
        </>
      ),
      body: 'This page covers this marketing website. The Tau application has its own privacy and account terms.',
    })}
    <article className='cell prose'>
      <h2>Optional analytics</h2>
      <p>
        Analytics is off by default. When an approved analytics endpoint is configured, you can allow a small set of
        page and action events or continue without them. Declining does not change the site’s content.
      </p>
      <p>
        We do not use session replay, automatic click capture, fingerprinting, account identifiers or form contents.
        Page events contain a known page label, not the address bar, query string or referrer. Only explicitly
        allowlisted campaign codes can be counted.
      </p>
      <h2>Browser storage</h2>
      <p>
        Your analytics preference is stored on this device. If you allow analytics, a browser-local marker can indicate
        a returning visit without sending a persistent visitor identifier. You can withdraw consent and clear these
        markers below.
      </p>
      <Button variant='outline' data-consent-reset disabled>
        Reset analytics preference
      </Button>
      <noscript>Enable JavaScript to reset this preference, or clear this site’s data in your browser.</noscript>
      <p role='status' id='privacy-status' />
      <h2>Hosting and external links</h2>
      <p>
        The hosting provider may process ordinary request information to deliver and secure this site. Opening the Tau
        app, documentation or GitHub takes you to a separate service with its own terms.
      </p>
      <p>
        <SiteLink href={`${appOrigin}/legal/privacy`}>Read the Tau application privacy policy {out}</SiteLink>
      </p>
    </article>
  </section>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
