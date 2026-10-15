import { SiteLink } from '#www/site-link.js';
import {
  down,
  cta,
  kicker,
  heroStage,
  storyMarkup,
  principleStrip,
  workspaceFigure,
  ecosystemGrid,
  caseCards,
  planCards,
  closing,
} from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <>
    <section className='band hero' aria-labelledby='hero-title'>
      <div className='cell hero-copy'>
        {kicker('AI-native CAD')}
        <h1 id='hero-title'>
          <span className='w w1'>Design</span> <span className='w w2'>Verify</span> <span className='w w3'>Make.</span>
        </h1>
        <p className='lead'>
          Describe the part you need. Tau creates editable parametric CAD and checks its geometry against your
          requirements. Export for machining or 3D printing, then make it, assemble it and put it to work.
        </p>
        <div className='actions'>
          {cta('Download Tau', '/download/', 'hero')}
          <SiteLink className='text-link' href='#story'>
            Watch it come together {down}
          </SiteLink>
        </div>
      </div>
      {heroStage()}
    </section>
    {principleStrip()}
    {storyMarkup()}
    <section className='band product' aria-labelledby='product-title'>
      <header className='cell section-head split'>
        {kicker('Your design, in view')}
        <h2 id='product-title'>
          From a conversation
          <br />
          to a useful part.
        </h2>
        <p>
          Talk through what the part needs to do. Shape it, check it and keep each revision as you work toward something
          you can make and use.{' '}
          <SiteLink className='text-link' href='/product/'>
            Inside the workspace →
          </SiteLink>
        </p>
      </header>
      <div className='cell'>{workspaceFigure()}</div>
    </section>
    {ecosystemGrid()}
    <section className='band' aria-labelledby='cases-title'>
      <header className='cell section-head'>
        {kicker('Built for the things you want to make')}
        <h2 id='cases-title'>
          Parts with
          <br />a purpose.
        </h2>
      </header>
      {caseCards()}
    </section>
    <section className='band pricing-teaser' aria-labelledby='pricing-title'>
      <header className='cell section-head split'>
        {kicker('Pricing')}
        <h2 id='pricing-title'>
          Start free.
          <br />
          Grow into Pro.
        </h2>
        <p>
          Pay for hosted AI with credits, or choose Pro for a monthly allowance and Tau Cloud sync.{' '}
          <SiteLink className='text-link' href='/pricing/'>
            Compare plans →
          </SiteLink>
        </p>
      </header>
      {planCards(true)}
    </section>
    <section className='band vision-teaser' aria-labelledby='vision-title'>
      <div className='cell'>
        {kicker('The bigger picture')}
        <h2 id='vision-title'>
          CAD is
          <br />
          chapter one.
        </h2>
      </div>
      <div className='cell'>
        <p className='lead'>
          The goal is a useful thing in the real world: machined, printed, assembled and put to work.
        </p>
        <p>
          Editable geometry and clear evidence are where that starts. See what you can do today and how we’re bringing
          design and making closer together.
        </p>
        <SiteLink className='text-link' href='/vision/'>
          Read the vision →
        </SiteLink>
      </div>
    </section>
    {closing()}
  </>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
