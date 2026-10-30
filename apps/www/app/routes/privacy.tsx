import { Button } from '@taucad/ui/components/button';
import { Link } from 'react-router';
import { intro } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <section className='band'>
    {intro({
      eyebrow: 'Privacy',
      title: 'Privacy on this site',
      body: 'How this website handles analytics and browser storage. For your Tau account and the Tau app, see the Privacy Policy.',
    })}
    <article className='cell prose'>
      <h2>Optional analytics</h2>
      <p>
        Analytics is off until you allow it. Your choice also applies to the Tau web app on this domain, where analytics
        means PostHog product analytics, including session recording. Declining does not change what the site shows.
      </p>
      <p>
        On this website, we do not use session replay, automatic click capture, fingerprinting, account identifiers or
        form contents. Page events record a fixed page label, not the full URL, query string or referrer. Only campaign
        codes on an allowlist are counted.
      </p>
      <h2>Browser storage</h2>
      <p>
        Your analytics choice is stored in a cookie on this device and shared with the Tau web app. If you allow
        analytics, a marker stored in your browser can show that you have visited before without sending a persistent
        visitor ID. You can withdraw consent and clear this data below.
      </p>
      <Button variant='outline' data-consent-reset disabled>
        Reset analytics preference
      </Button>
      <noscript>Enable JavaScript to reset this preference, or clear this site’s data in your browser.</noscript>
      <p role='status' id='privacy-status' />
      <h2>Hosting and external links</h2>
      <p>
        Our hosting provider may process standard request data, such as IP addresses, to serve and secure this site. The
        Tau app, documentation and GitHub are separate services with their own terms.
      </p>
      <p>
        <Link to='/legal/privacy/' prefetch='intent'>
          Read the Tau Privacy Policy
        </Link>{' '}
        and the{' '}
        <Link to='/legal/cookies/' prefetch='intent'>
          Storage and Cookie Policy
        </Link>
        .
      </p>
    </article>
  </section>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
