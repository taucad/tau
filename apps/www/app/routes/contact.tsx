import { SiteLink } from '#www/site-link.js';
import { discordUrl, salesEmail, sourceUrl } from '#www/content.js';
import { out, intro } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <section className='band'>
    {intro({
      eyebrow: 'Contact',
      title: 'Contact us',
      body: 'Questions about Tau, team plans or contributing? Choose the channel that fits.',
    })}
    <div className='contact-grid'>
      <article className='cell'>
        <h2>Teams & enterprise</h2>
        <p>Enterprise plans, team setup, invoicing and data processing agreements.</p>
        <SiteLink className='button primary' href={`mailto:${salesEmail}`}>
          Contact us {out}
        </SiteLink>
      </article>
      <article className='cell'>
        <h2>Community</h2>
        <p>Ask questions, share your projects and get updates on Discord.</p>
        <SiteLink className='text-link' href={discordUrl}>
          Join the Discord {out}
        </SiteLink>
      </article>
      <article className='cell'>
        <h2>Bugs & contributions</h2>
        <p>Report a bug or contribute on GitHub. Tau is open source under the Apache-2.0 license.</p>
        <SiteLink className='text-link' href={`${sourceUrl}/issues`}>
          Open an issue {out}
        </SiteLink>
      </article>
    </div>
  </section>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
