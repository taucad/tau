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
import { Button } from '@taucad/ui/components/button';
import { appOrigin } from '#www/environment.js';
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
          Describe the part you need. Tau builds it as editable parametric CAD, checks the geometry against your
          requirements and exports STEP, STL or 3MF for machining and 3D printing.
        </p>
        <div className='actions'>
          {cta('Download Tau', '/download/', 'hero')}
          <SiteLink className='text-link' href='#story'>
            See how it works {down}
          </SiteLink>
        </div>
        <div className='agent-prompt'>
          <p className='fine'>Using Claude Code or Codex? Paste this into your agent:</p>
          {/* One text node, so the UI edge function can name staging's own agent page before React hydrates it. */}
          <code id='agent-prompt-text' suppressHydrationWarning>
            {`Install the Tau plugin from ${appOrigin}/llms.txt`}
          </code>
          <Button
            type='button'
            variant='outline'
            size='sm'
            data-copy='agent-prompt-text'
            data-event='cta'
            data-placement='hero-agent'
            aria-label='Copy the agent prompt'
            hidden
          >
            Copy
          </Button>
          <span role='status' className='sr-only' />
        </div>
      </div>
      {heroStage()}
    </section>
    {principleStrip()}
    {storyMarkup()}
    <section className='band product' aria-labelledby='product-title'>
      <header className='cell section-head split'>
        {kicker('The workspace')}
        <h2 id='product-title'>
          Chat, code and model
          <br />
          in one window.
        </h2>
        <p>
          The agent conversation, the source files, the 3D view and the parameters sit side by side, and every change is
          kept in the project’s revision history.{' '}
          <SiteLink className='text-link' href='/product/'>
            More about the product →
          </SiteLink>
        </p>
      </header>
      <div className='cell'>{workspaceFigure()}</div>
    </section>
    {ecosystemGrid()}
    <section className='band' aria-labelledby='cases-title'>
      <header className='cell section-head'>
        {kicker('Use cases')}
        <h2 id='cases-title'>
          For makers, engineers
          <br />
          and students.
        </h2>
      </header>
      {caseCards()}
    </section>
    <section className='band pricing-teaser' aria-labelledby='pricing-title'>
      <header className='cell section-head split'>
        {kicker('Pricing')}
        <h2 id='pricing-title'>Free to start.</h2>
        <p>
          Use Tau for free and pay for hosted AI with credits. Pro is US$20 a month and adds 2,000 credits and Tau Cloud
          backup and sync.{' '}
          <SiteLink className='text-link' href='/pricing/'>
            Compare plans →
          </SiteLink>
        </p>
      </header>
      {planCards(true)}
    </section>
    <section className='band vision-teaser' aria-labelledby='vision-title'>
      <div className='cell'>
        {kicker('Vision')}
        <h2 id='vision-title'>
          Where Tau
          <br />
          is going.
        </h2>
      </div>
      <div className='cell'>
        <p className='lead'>Today, Tau covers design, geometry checks and export for manufacturing.</p>
        <p>
          Next, we’re working on closer links between design, fabrication, sourcing and service. The vision page sets
          out what works today and what is still in development.
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
