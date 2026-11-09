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
        title: 'Plans and pricing',
        body: 'Every plan includes design, local geometry checks, export and cloud backup. On Free, you pay for hosted AI with credits. Pro adds 2,000 credits a month and 10 GB of backup.',
      })}
      {planCards()}
      <p className='cell fine'>Prices are in US dollars and exclude tax. Plans and limits match the Tau app.</p>
    </section>
    <section className='band faq' aria-labelledby='faq-title'>
      <div className='cell'>
        <h2 id='faq-title'>Common questions</h2>
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
