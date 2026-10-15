import { SiteLink } from '#www/site-link.js';
import { discordUrl, salesEmail, sourceUrl } from '#www/content.js';
import { out, intro } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <section className='band'>
    {intro({
      eyebrow: 'Let’s make something useful',
      title: (
        <>
          Tell us what
          <br />
          you’re working on.
        </>
      ),
      body: 'Tell us what you want to make, how you plan to make it and where you need a hand. Talk with the people building Tau.',
    })}
    <div className='contact-grid'>
      <article className='cell'>
        <h2>Teams & enterprise</h2>
        <p>Your design and manufacturing workflow, team needs, invoicing or a data processing agreement.</p>
        <SiteLink className='button primary' href={`mailto:${salesEmail}`}>
          {salesEmail} {out}
        </SiteLink>
      </article>
      <article className='cell'>
        <h2>Community</h2>
        <p>Share what you’re making, ask a question or follow the work as it happens.</p>
        <SiteLink className='text-link' href={discordUrl}>
          Join the Discord {out}
        </SiteLink>
      </article>
      <article className='cell'>
        <h2>Issues & source</h2>
        <p>Found a bug or want to contribute? Tau is Apache-2.0 open source.</p>
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
