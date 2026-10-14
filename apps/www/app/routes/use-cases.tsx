import { intro, caseCards, closing } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <>
    <section className='band'>
      {intro({
        eyebrow: 'What will you make?',
        title: (
          <>
            What do you need
            <br />
            it to do?
          </>
        ),
        body: 'A mount for your project, a component for your team or a mechanism you want to understand. Design it, check the geometry and take it into the workshop.',
      })}
      {caseCards()}
    </section>
    {closing()}
  </>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
