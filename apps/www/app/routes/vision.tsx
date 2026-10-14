import { SiteLink } from '#www/site-link.js';
import { appOrigin } from '#www/environment.js';
import { visionChapters } from '#www/content.js';
import { out, kicker, intro, closing } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <>
    <section className='band'>
      {intro({
        eyebrow: 'The Tau vision',
        title: (
          <>
            Give ideas
            <br />
            <em>physical form.</em>
          </>
        ),
        body: 'Design something useful. Verify the details. Make it and put it to work. We’re building open tools that connect an idea to the part, assembly or product it becomes.',
        aside: (
          <img
            className='vision-metal'
            src='/_www/assets/metal-hero.webp'
            srcSet='/_www/assets/metal-hero-640.webp 640w, /_www/assets/metal-hero.webp 1100w'
            sizes='(max-width: 760px) 80vw, 40vw'
            width='1100'
            height='1100'
            fetchPriority='high'
            alt='Tau’s polished metal Escher star, rendered with the material and studio from the Tau app'
          />
        ),
      })}
    </section>
    <section className='band vision-steps' aria-label='Where Tau is today and where it is heading'>
      <ol>
        {visionChapters.map(([status, title, body], index) => (
          <li key={title} className='cell'>
            <p className='kicker'>
              <span className='step'>0{index + 1}</span> {status}
            </p>
            <h2>{title}</h2>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </section>
    <section className='band split-band'>
      <div className='cell'>
        {kicker('A real starting point')}
        <h2>
          The distance from
          <br />
          thought to thing.
        </h2>
      </div>
      <div className='cell'>
        <p className='lead'>
          A design earns its place when you can make it, fit it and use it. Good tools help you carry that purpose
          through every decision.
        </p>
        <p>
          From a printed prototype to a machined component, we want more people to make things they understand, with
          editable source and clear evidence close at hand. See it in practice in the{' '}
          <SiteLink href='/#story'>planetary gearbox story</SiteLink>, or open the{' '}
          <SiteLink href={`${appOrigin}/vision`}>interactive 3D vision {out}</SiteLink> in the Tau app.
        </p>
      </div>
    </section>
    {closing(
      <>
        Make something
        <br />
        that matters.
      </>,
    )}
  </>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
