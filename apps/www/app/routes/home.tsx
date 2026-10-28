import { SiteLink } from '#www/site-link.js';
import {
  down,
  out,
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
import { exampleModelPath } from '#www/content.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <>
    <section className='band hero' aria-labelledby='hero-title'>
      <div className='cell hero-copy'>
        {kicker('Code-CAD · Replicad and OpenSCAD')}
        <h1 id='hero-title'>
          <span className='w w1'>Design</span> <span className='w w2'>Verify</span> <span className='w w3'>Make.</span>
        </h1>
        <p className='lead'>
          Open this planetary gearbox, change one number and export STL. The solid comes from Replicad code you write,
          or that Claude Code or Codex writes for you.
        </p>
        <div className='actions'>
          {cta('Open the gearbox', exampleModelPath, 'hero')}
          <SiteLink className='text-link' href='/llms.txt' data-event='cta' data-placement='hero-plugin'>
            Install the agent plugin {out}
          </SiteLink>
          <SiteLink
            className='text-link'
            href='/download/'
            data-event='cta'
            data-placement='hero-download'
            data-host-download='page'
          >
            Download Tau
          </SiteLink>
          <SiteLink className='text-link' href='#story'>
            Watch it come together {down}
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
        {kicker('Your design, in view')}
        <h2 id='product-title'>
          The code, the parameters
          <br />
          and the solid.
        </h2>
        <p>
          The workspace shows the source, the named parameters and the model. An agent can edit that code. The part
          comes from the code.{' '}
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
