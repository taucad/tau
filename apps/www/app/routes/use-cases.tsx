import { intro, caseCards, closing } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <>
    <section className='band'>
      {intro({
        eyebrow: 'Use cases',
        title: 'What you can make with Tau',
        body: 'Prototype a mount or enclosure, design parts for an engineering project or learn how a mechanism works by changing it.',
      })}
      {caseCards()}
    </section>
    {closing('Get started with Tau')}
  </>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
