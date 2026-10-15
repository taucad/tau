import { pricingFaq } from '#www/content.js';
import { intro, planCards, closing } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <>
    <section className='band'>
      {intro({
        eyebrow: 'Pricing · USD',
        title: (
          <>
            Your next part
            <br />
            starts here.
          </>
        ),
        body: 'Design, run local geometry checks and export on every plan. Start free with credits for hosted AI, or choose Pro for a monthly allowance and Tau Cloud backup and sync.',
      })}
      {planCards()}
      <p className='cell fine'>
        Plans and limits as listed in the Tau app. Prices exclude applicable tax. ○ marks features in development; they
        are not part of a plan today.
      </p>
    </section>
    <section className='band faq' aria-labelledby='faq-title'>
      <div className='cell'>
        <h2 id='faq-title'>A little more detail.</h2>
      </div>
      <div className='cell'>
        {pricingFaq.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
    {closing()}
  </>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
