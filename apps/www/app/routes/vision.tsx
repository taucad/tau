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
        eyebrow: 'Vision',
        title: 'From idea to physical part',
        body: 'We’re building open-source tools that take a design from an idea to something you can make: editable CAD, geometry checks and exports for manufacturing.',
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
        {kicker('Why we’re building Tau')}
        <h2>Tools for people who make things</h2>
      </div>
      <div className='cell'>
        <p className='lead'>
          We want more people to design parts they understand and can make, from a 3D-printed prototype to a machined
          component.
        </p>
        <p>
          Every design keeps its editable source and its check results. See an example in the{' '}
          <SiteLink href='/#story'>planetary gearbox walkthrough</SiteLink>, or open the{' '}
          <SiteLink href={`${appOrigin}/vision`}>interactive 3D vision {out}</SiteLink> in the Tau app.
        </p>
      </div>
    </section>
    {closing()}
  </>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
